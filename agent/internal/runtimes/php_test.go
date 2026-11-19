package runtimes

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindExtDef(t *testing.T) {
	tests := []struct {
		name    string
		wantDef string
		wantOk  bool
	}{
		{"curl", "curl", true},
		{"CURL", "curl", true},
		{"mbstring", "mbstring", true},
		{"pdo_mysql", "pdo_mysql", true},
		{"mysql", "pdo_mysql", true},
		{"redis", "redis", true},
		{"imagick", "imagick", true},
		{"opcache", "opcache", true},
		{"unknown_ext", "", false},
	}

	for _, tt := range tests {
		def, ok := FindExtDef(tt.name)
		if ok != tt.wantOk {
			t.Errorf("FindExtDef(%q) ok = %v, want %v", tt.name, ok, tt.wantOk)
		}
		if ok && def.Name != tt.wantDef {
			t.Errorf("FindExtDef(%q) def.Name = %q, want %q", tt.name, def.Name, tt.wantDef)
		}
	}
}

func TestListExtensions(t *testing.T) {
	// Test invalid version
	if _, err := ListExtensions("invalid-ver"); err == nil {
		t.Error("ListExtensions with invalid version expected error, got nil")
	}

	// Test valid version
	res, err := ListExtensions("8.4")
	if err != nil {
		t.Fatalf("ListExtensions(8.4) error: %v", err)
	}
	if res.Version != "8.4" {
		t.Errorf("res.Version = %s, want 8.4", res.Version)
	}
	if len(res.Extensions) != len(CommonExtensions) {
		t.Errorf("got %d extensions, want %d", len(res.Extensions), len(CommonExtensions))
	}

	// Test default version
	resDef, err := ListExtensions("")
	if err != nil {
		t.Fatalf("ListExtensions(\"\") error: %v", err)
	}
	if resDef.Version == "" {
		t.Error("resDef.Version should not be empty")
	}
}

func TestToggleExtensionValidation(t *testing.T) {
	if err := ToggleExtension("bad-ver", "curl", true); err == nil {
		t.Error("ToggleExtension bad version expected error, got nil")
	}
	if err := ToggleExtension("8.4", "nonexistent", true); err == nil {
		t.Error("ToggleExtension unknown extension expected error, got nil")
	}
}

func TestIniDirectivesParsingAndUpdating(t *testing.T) {
	sampleIni := `; Sample PHP configuration
[PHP]
engine = On
max_execution_time = 30
memory_limit = 128M
;max_input_vars = 1000
post_max_size = 8M
upload_max_filesize = 2M
display_errors = Off
;date.timezone =
`

	directives := make(map[string]string)
	for k, v := range DefaultDirectiveValues {
		directives[k] = v
	}
	readDirectivesFromContent(sampleIni, directives)

	if directives["max_execution_time"] != "30" {
		t.Errorf("max_execution_time = %s, want 30", directives["max_execution_time"])
	}
	if directives["memory_limit"] != "128M" {
		t.Errorf("memory_limit = %s, want 128M", directives["memory_limit"])
	}
	if directives["max_input_vars"] != "1000" {
		t.Errorf("max_input_vars = %s, want 1000", directives["max_input_vars"])
	}
	if directives["post_max_size"] != "8M" {
		t.Errorf("post_max_size = %s, want 8M", directives["post_max_size"])
	}
	if directives["upload_max_filesize"] != "2M" {
		t.Errorf("upload_max_filesize = %s, want 2M", directives["upload_max_filesize"])
	}
	if directives["display_errors"] != "Off" {
		t.Errorf("display_errors = %s, want Off", directives["display_errors"])
	}

	// Now update directives
	updates := map[string]string{
		"memory_limit":        "512M",
		"upload_max_filesize": "128M",
		"post_max_size":       "128M",
		"max_execution_time":  "120",
		"max_input_vars":      "3000",
		"display_errors":      "On",
		"date.timezone":       "Europe/London",
	}

	updatedContent := updateIniDirectives(sampleIni, updates)

	readBack := make(map[string]string)
	readDirectivesFromContent(updatedContent, readBack)

	for k, want := range updates {
		if got := readBack[k]; got != want {
			t.Errorf("after update, directive %s = %s, want %s", k, got, want)
		}
	}
}

func TestValidateDirective(t *testing.T) {
	// Valid
	val, err := validateDirective("upload_max_filesize", "128M")
	if err != nil || val != "128M" {
		t.Errorf("expected 128M, got %s, err: %v", val, err)
	}

	val, err = validateDirective("memory_limit", "-1")
	if err != nil || val != "-1" {
		t.Errorf("expected -1, got %s, err: %v", val, err)
	}

	val, err = validateDirective("display_errors", "true")
	if err != nil || val != "On" {
		t.Errorf("expected On, got %s, err: %v", val, err)
	}

	val, err = validateDirective("display_errors", "0")
	if err != nil || val != "Off" {
		t.Errorf("expected Off, got %s, err: %v", val, err)
	}

	val, err = validateDirective("date.timezone", "America/New_York")
	if err != nil || val != "America/New_York" {
		t.Errorf("expected America/New_York, got %s, err: %v", val, err)
	}

	// Invalid
	if _, err := validateDirective("upload_max_filesize", "invalid"); err == nil {
		t.Error("expected error for invalid size")
	}
	if _, err := validateDirective("max_execution_time", "-50"); err == nil {
		t.Error("expected error for negative execution time")
	}
	if _, err := validateDirective("display_errors", "maybe"); err == nil {
		t.Error("expected error for invalid display_errors")
	}
	if _, err := validateDirective("unknown_directive", "123"); err == nil {
		t.Error("expected error for unknown directive")
	}
}

func TestSetPHPConfigInTempDir(t *testing.T) {
	tmpDir := t.TempDir()
	fpmDir := filepath.Join(tmpDir, "etc/php/8.4/fpm")
	if err := os.MkdirAll(fpmDir, 0o755); err != nil {
		t.Fatal(err)
	}
	iniPath := filepath.Join(fpmDir, "php.ini")
	initial := "[PHP]\nupload_max_filesize = 10M\nmemory_limit = 128M\n"
	if err := os.WriteFile(iniPath, []byte(initial), 0o644); err != nil {
		t.Fatal(err)
	}

	directives := map[string]string{
		"upload_max_filesize": "64M",
		"memory_limit":        "512M",
		"display_errors":      "Off",
	}

	norm := make(map[string]string)
	for k, v := range directives {
		vNorm, err := validateDirective(k, v)
		if err != nil {
			t.Fatalf("validateDirective %s: %v", k, err)
		}
		norm[k] = vNorm
	}

	newContent := updateIniDirectives(initial, norm)
	if err := os.WriteFile(iniPath, []byte(newContent), 0o644); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(iniPath)
	if err != nil {
		t.Fatal(err)
	}
	parsed := make(map[string]string)
	readDirectivesFromContent(string(data), parsed)

	if parsed["upload_max_filesize"] != "64M" {
		t.Errorf("got %s, want 64M", parsed["upload_max_filesize"])
	}
	if parsed["memory_limit"] != "512M" {
		t.Errorf("got %s, want 512M", parsed["memory_limit"])
	}
	if parsed["display_errors"] != "Off" {
		t.Errorf("got %s, want Off", parsed["display_errors"])
	}
}
