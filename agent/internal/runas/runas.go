// Package runas resolves configured run-as users to numeric uid/gid pairs.
package runas

import (
	"fmt"
	"os/user"
	"strconv"
)

// Lookup resolves the numeric uid/gid of username.
func Lookup(username string) (int, int, error) {
	account, err := user.Lookup(username)
	if err != nil {
		return 0, 0, fmt.Errorf("lookup user %q: %w", username, err)
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return 0, 0, fmt.Errorf("user %q has invalid uid %q", username, account.Uid)
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return 0, 0, fmt.Errorf("user %q has invalid gid %q", username, account.Gid)
	}
	return uid, gid, nil
}
