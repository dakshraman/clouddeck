// Package php discovers the PHP versions installed on the host.
package php

import (
	"os"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// "none" means a static site; versions come from /etc/php/<version> dirs.
var versionRe = regexp.MustCompile(`^\d+\.\d+$`)

var fallback = []string{"none", "8.1", "8.2", "8.3", "8.4"}

// Available lists offered PHP versions: "none" plus every immediate
// subdirectory of base that looks like "8.3", sorted ascending. On unsupported
// hosts or when nothing is detected it returns the built-in fallback list.
func Available(base string) []string {
	if runtime.GOOS != "linux" && runtime.GOOS != "darwin" {
		return fallbackCopy()
	}
	searchBases := []string{base}
	if runtime.GOOS == "darwin" {
		searchBases = append(searchBases, "/opt/homebrew/etc/php", "/usr/local/etc/php")
	}
	var found []string
	for _, b := range searchBases {
		entries, err := os.ReadDir(b)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() && versionRe.MatchString(e.Name()) {
				if !contains(found, e.Name()) {
					found = append(found, e.Name())
				}
			}
		}
	}
	if len(found) == 0 {
		return fallbackCopy()
	}
	sort.Slice(found, func(i, j int) bool { return less(found[i], found[j]) })
	return append([]string{"none"}, found...)
}

func contains(slice []string, val string) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}

// Offered reports whether version is in Available(base).
func Offered(base, version string) bool {
	if version == "none" {
		return true
	}
	for _, v := range Available(base) {
		if v == version {
			return true
		}
	}
	return false
}

func fallbackCopy() []string {
	return append([]string{}, fallback...)
}

// less orders "8.9" before "8.10" (numeric, not lexicographic).
func less(a, b string) bool {
	aMajor, aMinor := split(a)
	bMajor, bMinor := split(b)
	if aMajor != bMajor {
		return aMajor < bMajor
	}
	return aMinor < bMinor
}

func split(v string) (int, int) {
	major, minor, _ := strings.Cut(v, ".")
	majorNum, _ := strconv.Atoi(major)
	minorNum, _ := strconv.Atoi(minor)
	return majorNum, minorNum
}
