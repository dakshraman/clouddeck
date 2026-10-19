package sshkeys

// This file holds public-key parsing, fingerprinting and small file helpers
// for the sshkeys service. The accepted line grammar is frozen in
// docs/api.md section 1.9.

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// keyNamePattern is the frozen generated-key name grammar.
const keyNamePattern = `^[a-z0-9][a-z0-9-]{0,31}$`

var keyNameRe = regexp.MustCompile(keyNamePattern)

// errUnparsablePub marks a .pub file that exists but holds no usable key.
var errUnparsablePub = errors.New("unparsable public key")

// allowedKeyTypes are the only key algorithms the API accepts.
var allowedKeyTypes = map[string]bool{
	"ssh-ed25519":         true,
	"ssh-rsa":             true,
	"ecdsa-sha2-nistp256": true,
	"ecdsa-sha2-nistp384": true,
	"ecdsa-sha2-nistp521": true,
}

// parsedKey is one successfully parsed OpenSSH public-key line.
type parsedKey struct {
	Type    string
	Blob    string // the base64 blob exactly as it appeared in the input
	Data    []byte // decoded blob
	Comment string // remaining fields joined with single spaces
}

// validKeyName reports whether name matches the frozen generated-key grammar.
func validKeyName(name string) bool {
	return keyNameRe.MatchString(name)
}

// parsePublicKey parses one OpenSSH public-key line: a supported type, a
// decodable standard-alphabet base64 blob and an optional comment. Leading and
// trailing whitespace is ignored.
func parsePublicKey(line string) (parsedKey, bool) {
	fields := strings.Fields(line)
	if len(fields) < 2 || !allowedKeyTypes[fields[0]] {
		return parsedKey{}, false
	}
	data, err := decodeKeyBlob(fields[1])
	if err != nil || len(data) == 0 {
		return parsedKey{}, false
	}
	return parsedKey{
		Type:    fields[0],
		Blob:    fields[1],
		Data:    data,
		Comment: strings.Join(fields[2:], " "),
	}, true
}

// decodeKeyBlob decodes a standard-alphabet base64 blob, accepting padded and
// unpadded input.
func decodeKeyBlob(s string) ([]byte, error) {
	if data, err := base64.StdEncoding.DecodeString(s); err == nil {
		return data, nil
	}
	return base64.RawStdEncoding.DecodeString(s)
}

// fingerprintOf returns the OpenSSH-style "SHA256:<base64>" fingerprint of a
// decoded public-key blob (unpadded base64, per the frozen contract).
func fingerprintOf(data []byte) string {
	sum := sha256.Sum256(data)
	return "SHA256:" + base64.RawStdEncoding.EncodeToString(sum[:])
}

// canonicalLine renders the stored form of a key: type, one space, the
// original base64 blob and the trimmed comment when present.
func (k parsedKey) canonicalLine() string {
	line := k.Type + " " + k.Blob
	if k.Comment != "" {
		line += " " + k.Comment
	}
	return line
}

// keyFromParsed builds the API Key for a parsed line.
func keyFromParsed(k parsedKey) Key {
	return Key{
		Type:        k.Type,
		Fingerprint: fingerprintOf(k.Data),
		Comment:     k.Comment,
		Line:        k.canonicalLine(),
	}
}

// parseKeyData returns the keys stored in an authorized_keys blob in file
// order, skipping blank, comment and unparsable lines.
func parseKeyData(data []byte) []Key {
	keys := []Key{}
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parsed, ok := parsePublicKey(line)
		if !ok {
			continue
		}
		keys = append(keys, keyFromParsed(parsed))
	}
	return keys
}

// ensureDirMode creates dir with perm and repairs its mode when it already
// exists. Filesystem roots and the current directory are never chmodded.
func ensureDirMode(dir string, perm os.FileMode) error {
	if err := os.MkdirAll(dir, perm); err != nil {
		return err
	}
	if dir == "." || filepath.Dir(dir) == dir {
		return nil
	}
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if info.Mode().Perm() != perm {
		return os.Chmod(dir, perm)
	}
	return nil
}

// appendKeysFileLine appends line to the keys file, creating the parent dir
// and repairing file modes. needsNewline inserts a separator when the file
// does not end with a newline.
func appendKeysFileLine(path, line string, needsNewline bool) error {
	if err := ensureDirMode(filepath.Dir(path), keysDirPerm); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, keysFilePerm)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := f.Chmod(keysFilePerm); err != nil {
		return err
	}
	prefix := ""
	if needsNewline {
		prefix = "\n"
	}
	_, err = f.WriteString(prefix + line + "\n")
	return err
}

// rewriteKeysFile replaces the keys file content, repairing its mode.
func rewriteKeysFile(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, keysFilePerm)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := f.Chmod(keysFilePerm); err != nil {
		return err
	}
	_, err = f.Write(data)
	return err
}

// readGeneratedPub reads and parses <dir>/<name>.pub; it never touches the
// private key file.
func readGeneratedPub(dir, name string) (GeneratedKey, error) {
	data, err := os.ReadFile(filepath.Join(dir, name+".pub"))
	if err != nil {
		return GeneratedKey{}, err
	}
	parsed, ok := parsePublicKey(string(data))
	if !ok {
		return GeneratedKey{}, fmt.Errorf("%w %s.pub", errUnparsablePub, name)
	}
	key := keyFromParsed(parsed)
	return GeneratedKey{
		Name:        name,
		Type:        key.Type,
		Comment:     key.Comment,
		Fingerprint: key.Fingerprint,
		PublicKey:   strings.TrimSpace(string(data)),
	}, nil
}
