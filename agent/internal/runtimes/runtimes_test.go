package runtimes

import "testing"

func TestDetectCoversEveryKind(t *testing.T) {
	got := Detect()
	want := []string{KindStatic, KindPHP, KindNode, KindPython, KindGo, KindRuby, KindJava, KindDocker, KindCustom}
	if len(got) != len(want) {
		t.Fatalf("got %d kinds, want %d", len(got), len(want))
	}
	for i, kind := range want {
		if got[i].Kind != kind {
			t.Fatalf("kind %d = %q, want %q", i, got[i].Kind, kind)
		}
		if got[i].Label == "" || got[i].Description == "" {
			t.Fatalf("kind %q is missing label or description", kind)
		}
	}
}

func TestStaticAndCustomAlwaysAvailable(t *testing.T) {
	for _, kind := range []string{KindStatic, KindCustom} {
		info, ok := Lookup(kind)
		if !ok {
			t.Fatalf("Lookup(%q) not found", kind)
		}
		if !info.Available {
			t.Fatalf("%q should always be available", kind)
		}
	}
}

func TestValidKind(t *testing.T) {
	for _, kind := range []string{KindStatic, KindPHP, KindNode, KindPython, KindGo, KindRuby, KindJava, KindDocker, KindCustom} {
		if !ValidKind(kind) {
			t.Fatalf("ValidKind(%q) = false", kind)
		}
	}
	for _, kind := range []string{"", "perl", "Node", "npm"} {
		if ValidKind(kind) {
			t.Fatalf("ValidKind(%q) = true", kind)
		}
	}
}

func TestIsApp(t *testing.T) {
	for _, kind := range []string{KindNode, KindPython, KindGo, KindRuby, KindJava, KindDocker, KindCustom} {
		if !IsApp(kind) {
			t.Fatalf("IsApp(%q) = false", kind)
		}
	}
	for _, kind := range []string{KindStatic, KindPHP} {
		if IsApp(kind) {
			t.Fatalf("IsApp(%q) = true", kind)
		}
	}
}

func TestDefaultPort(t *testing.T) {
	cases := map[string]int{
		KindNode:   3000,
		KindPython: 8000,
		KindGo:     8080,
		KindRuby:   9292,
		"unknown":  8080,
	}
	for kind, want := range cases {
		if got := DefaultPort(kind); got != want {
			t.Fatalf("DefaultPort(%q) = %d, want %d", kind, got, want)
		}
	}
}

func TestVersionOrdering(t *testing.T) {
	if !lessVersion("v8.0.0", "v22.1.0") {
		t.Fatal("v8 should sort before v22")
	}
	if !lessVersion("3.9", "3.12") {
		t.Fatal("3.9 should sort before 3.12")
	}
	if lessVersion("3.12", "3.9") {
		t.Fatal("3.12 should not sort before 3.9")
	}
}
