// SHA-512 crypt ("$6$") in pure Go, used for pure-ftpd virtual logins. The
// implementation follows Ulrich Drepper's specification
// (https://akkadia.org/drepper/SHA-crypt.txt).
package ftp

import (
	"crypto/rand"
	"crypto/sha512"
	"fmt"
	"strconv"
	"strings"
)

const (
	// sha512DefaultRounds is the crypt(3) default round count.
	sha512DefaultRounds = 5000
	// sha512RoundsMin is the crypt(3) minimum; lower values are clamped.
	sha512RoundsMin = 1000
	// sha512RoundsMax is the crypt(3) maximum; higher values are clamped.
	sha512RoundsMax = 999999999
	// sha512SaltLen is the maximum salt length crypt(3) uses.
	sha512SaltLen = 16
	// sha512DigestLen is the size of a SHA-512 digest.
	sha512DigestLen = 64
	// saltChars is the alphabet salts are generated from; it has exactly 64
	// characters, so taking random bytes modulo its length is uniform.
	saltChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789./"
	// cryptB64 is the crypt(3) base64 alphabet.
	cryptB64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

// generateSalt returns a fresh random 16-character salt from the crypt(3)
// salt alphabet.
func generateSalt() (string, error) {
	buf := make([]byte, sha512SaltLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("read random salt: %w", err)
	}
	for i, b := range buf {
		buf[i] = saltChars[int(b)%len(saltChars)]
	}
	return string(buf), nil
}

// hashPassword hashes password with a fresh random salt and returns the full
// "$6$<salt>$<hash>" string.
func hashPassword(password string) (string, error) {
	salt, err := generateSalt()
	if err != nil {
		return "", err
	}
	return sha512Crypt(password, salt), nil
}

// sha512Crypt computes the crypt(3) SHA-512 hash of password. salt may be a
// bare salt string, "$6$<salt>" or "$6$rounds=<n>$<salt>", exactly like the
// salt argument of crypt(3): it is truncated to 16 characters and rounds are
// clamped to [1000, 999999999]. The result has the form
// "$6$[rounds=<n>$]<salt>$<86-character base64 digest>".
func sha512Crypt(password, salt string) string {
	salt, rounds, customRounds := splitSalt(salt)

	key := []byte(password)
	keyLen := len(key)
	saltBytes := []byte(salt)
	saltLen := len(saltBytes)

	// Digests A and B: A is the primary digest, B the "alternate sum" of
	// password+salt+password.
	a := sha512.New()
	a.Write(key)
	a.Write(saltBytes)

	b := sha512.New()
	b.Write(key)
	b.Write(saltBytes)
	b.Write(key)
	alt := b.Sum(nil)

	// Add one byte of the alternate sum for every byte of the password.
	cnt := keyLen
	for cnt > 64 {
		a.Write(alt)
		cnt -= 64
	}
	a.Write(alt[:cnt])

	// For every bit of the password length add the alternate sum (1) or the
	// password (0), starting from the lowest bit.
	for n := keyLen; n > 0; n >>= 1 {
		if n&1 != 0 {
			a.Write(alt)
		} else {
			a.Write(key)
		}
	}
	alt = a.Sum(nil)

	// Byte sequence P: the password repeated to the password's length, taken
	// from digest DP (the password hashed once per byte of itself).
	dp := sha512.New()
	for i := 0; i < keyLen; i++ {
		dp.Write(key)
	}
	pBytes := expandDigest(dp.Sum(nil), keyLen)

	// Byte sequence S: the salt repeated to the salt's length, taken from
	// digest DS (the salt hashed 16+A[0] times).
	ds := sha512.New()
	for i := 0; i < 16+int(alt[0]); i++ {
		ds.Write(saltBytes)
	}
	sBytes := expandDigest(ds.Sum(nil), saltLen)

	// Repeatedly rehash, mixing P, S and the previous digest.
	c := sha512.New()
	for i := 0; i < rounds; i++ {
		c.Reset()
		if i&1 != 0 {
			c.Write(pBytes)
		} else {
			c.Write(alt)
		}
		if i%3 != 0 {
			c.Write(sBytes)
		}
		if i%7 != 0 {
			c.Write(pBytes)
		}
		if i&1 != 0 {
			c.Write(alt)
		} else {
			c.Write(pBytes)
		}
		alt = c.Sum(nil)
	}

	var out strings.Builder
	out.WriteString("$6$")
	if customRounds {
		fmt.Fprintf(&out, "rounds=%d$", rounds)
	}
	out.WriteString(salt)
	out.WriteByte('$')
	encodeSHA512B64(&out, alt)
	return out.String()
}

// splitSalt decodes the salt argument of crypt(3) into the bare salt (at
// most 16 characters), the round count and whether rounds were specified
// explicitly.
func splitSalt(raw string) (salt string, rounds int, customRounds bool) {
	rounds = sha512DefaultRounds
	rest := raw
	if strings.HasPrefix(rest, "$6$") {
		rest = rest[len("$6$"):]
	}
	if strings.HasPrefix(rest, "rounds=") {
		rest = rest[len("rounds="):]
		digits := 0
		for digits < len(rest) && rest[digits] >= '0' && rest[digits] <= '9' {
			digits++
		}
		if digits < len(rest) && rest[digits] == '$' {
			n, err := strconv.ParseUint(rest[:digits], 10, 64)
			if err != nil {
				n = 0
			}
			if n < sha512RoundsMin {
				n = sha512RoundsMin
			}
			if n > sha512RoundsMax {
				n = sha512RoundsMax
			}
			rounds = int(n)
			customRounds = true
			rest = rest[digits+1:]
		}
	}
	if i := strings.IndexByte(rest, '$'); i >= 0 {
		rest = rest[:i]
	}
	if len(rest) > sha512SaltLen {
		rest = rest[:sha512SaltLen]
	}
	return rest, rounds, customRounds
}

// expandDigest repeats digest until n bytes have been produced.
func expandDigest(digest []byte, n int) []byte {
	out := make([]byte, n)
	for i := 0; i < n; i += sha512DigestLen {
		copy(out[i:], digest)
	}
	return out
}

// encodeSHA512B64 appends the crypt base64 encoding of a SHA-512 digest. The
// groups of digest bytes and their order are frozen by the specification.
func encodeSHA512B64(out *strings.Builder, digest []byte) {
	groups := [][3]int{
		{0, 21, 42}, {22, 43, 1}, {44, 2, 23}, {3, 24, 45},
		{25, 46, 4}, {47, 5, 26}, {6, 27, 48}, {28, 49, 7},
		{50, 8, 29}, {9, 30, 51}, {31, 52, 10}, {53, 11, 32},
		{12, 33, 54}, {34, 55, 13}, {56, 14, 35}, {15, 36, 57},
		{37, 58, 16}, {59, 17, 38}, {18, 39, 60}, {40, 61, 19},
		{62, 20, 41},
	}
	for _, g := range groups {
		writeB64(out, digest[g[0]], digest[g[1]], digest[g[2]], 4)
	}
	writeB64(out, 0, 0, digest[63], 2)
}

// writeB64 appends n crypt-base64 characters of the 24-bit value
// B2<<16 | B1<<8 | B0, lowest six bits first.
func writeB64(out *strings.Builder, b2, b1, b0 byte, n int) {
	w := uint32(b2)<<16 | uint32(b1)<<8 | uint32(b0)
	for i := 0; i < n; i++ {
		out.WriteByte(cryptB64[w&0x3f])
		w >>= 6
	}
}
