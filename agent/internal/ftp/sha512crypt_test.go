package ftp

import (
	"regexp"
	"strings"
	"testing"
)

// hashRe matches the frozen "$6$<16-char salt>$<86-char digest>" shape.
var hashRe = regexp.MustCompile(`^\$6\$[A-Za-z0-9./]{16}\$[A-Za-z0-9./]{86}$`)

// TestSHA512CryptVectors checks the implementation against the canonical test
// vectors of Ulrich Drepper's SHA-crypt specification, including a rounds=
// variant, the rounds clamp and passwords longer than the 64-byte digest.
func TestSHA512CryptVectors(t *testing.T) {
	tests := []struct {
		name     string
		salt     string
		password string
		want     string
	}{
		{
			name:     "default rounds",
			salt:     "$6$saltstring",
			password: "Hello world!",
			want:     "$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1",
		},
		{
			name:     "rounds=10000",
			salt:     "$6$rounds=10000$saltstringsaltstring",
			password: "Hello world!",
			want:     "$6$rounds=10000$saltstringsaltst$OW1/O6BYHV6BcXZu8QVeXbDWra3Oeqh0sbHbbMCVNSnCM/UrjmM0Dp8vOuZeHBy/YTBmSK6H9qs/y3RnOaw5v.",
		},
		{
			name:     "explicit rounds=5000",
			salt:     "$6$rounds=5000$toolongsaltstring",
			password: "This is just a test",
			want:     "$6$rounds=5000$toolongsaltstrin$lQ8jolhgVRVhY4b5pZKaysCLi0QBxGoNeKQzQ3glMhwllF7oGDZxUhx1yxdYcz/e1JSbq3y6JMxxl8audkUEm0",
		},
		{
			name:     "password longer than 64 bytes",
			salt:     "$6$rounds=1400$anotherlongsaltstring",
			password: "a very much longer text to encrypt.  This one even stretches over morethan one line.",
			want:     "$6$rounds=1400$anotherlongsalts$POfYwTEok97VWcjxIiSOjiykti.o/pQs.wPvMxQ6Fm7I6IoYN3CmLs66x9t0oSwbtEW7o7UmJEiDwGqd8p4ur1",
		},
		{
			name:     "long password and short salt",
			salt:     "$6$rounds=77777$short",
			password: "we have a short salt string but not a short password",
			want:     "$6$rounds=77777$short$WuQyW2YR.hBNpjjRhpYD/ifIw05xdfeEyQoMxIXbkvr0gge1a1x3yRULJ5CCaUeOxFmtlcGZelFl5CxtgfiAc0",
		},
		{
			name:     "16-character salt",
			salt:     "$6$rounds=123456$asaltof16chars..",
			password: "a short string",
			want:     "$6$rounds=123456$asaltof16chars..$BtCwjqMJGx5hrJhZywWvt0RLE8uZ4oPwcelCjmw2kSYu.Ec6ycULevoBK25fs2xXgMNrCzIMVcgEJAstJeonj1",
		},
		{
			name:     "rounds below the minimum are clamped",
			salt:     "$6$rounds=10$roundstoolow",
			password: "the minimum number is still observed",
			want:     "$6$rounds=1000$roundstoolow$kUMsbe306n21p9R.FRkW3IGn.S9NPN0x50YhH1xhLsPuWGsUSklZt58jaTfF4ZEQpyUNGc0dqbpBYYBaHHrsX.",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sha512Crypt(tt.password, tt.salt); got != tt.want {
				t.Fatalf("sha512Crypt(%q, %q) = %q, want %q", tt.password, tt.salt, got, tt.want)
			}
		})
	}
}

// TestSHA512CryptBareSalt checks that a bare salt string hashes like the same
// salt behind the "$6$" prefix.
func TestSHA512CryptBareSalt(t *testing.T) {
	want := "$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1"
	if got := sha512Crypt("Hello world!", "saltstring"); got != want {
		t.Fatalf("bare salt = %q, want %q", got, want)
	}
}

// TestGenerateSalt checks the frozen salt length, alphabet and randomness.
func TestGenerateSalt(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 64; i++ {
		salt, err := generateSalt()
		if err != nil {
			t.Fatalf("generateSalt: %v", err)
		}
		if len(salt) != sha512SaltLen {
			t.Fatalf("salt %q has %d characters, want %d", salt, len(salt), sha512SaltLen)
		}
		for _, r := range salt {
			if !strings.ContainsRune(saltChars, r) {
				t.Fatalf("salt %q contains %q, outside [A-Za-z0-9./]", salt, r)
			}
		}
		seen[salt] = true
	}
	if len(seen) < 2 {
		t.Fatal("generateSalt did not produce distinct salts")
	}
}

// TestHashPasswordFormat checks the frozen hash shape and that the embedded
// salt verifies the password.
func TestHashPasswordFormat(t *testing.T) {
	hash, err := hashPassword("hunter2!!")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if !hashRe.MatchString(hash) {
		t.Fatalf("hash %q does not match %s", hash, hashRe)
	}
	prefix := hash[:strings.LastIndexByte(hash, '$')+1]
	if got := sha512Crypt("hunter2!!", prefix); got != hash {
		t.Fatalf("hash does not verify its password: %q != %q", got, hash)
	}
	if got := sha512Crypt("wrong-password", prefix); got == hash {
		t.Fatal("hash verified a wrong password")
	}

	other, err := hashPassword("hunter2!!")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if other == hash {
		t.Fatal("two hashes of the same password must use different salts")
	}
}
