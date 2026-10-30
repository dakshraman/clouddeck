package tasks

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/store"
)

func newTestStore(t *testing.T) *store.Store {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	return st
}

func TestEngineTaskSuccess(t *testing.T) {
	st := newTestStore(t)
	eng := New(st, context.Background())

	task, err := eng.Create("test.success", "example.com", func(ctx context.Context, log LogFunc) error {
		log("info", "doing work")
		return nil
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	eng.Wait()

	got, ok := eng.Get(task.ID)
	if !ok {
		t.Fatalf("Get(%s) not found", task.ID)
	}
	if got.Status != store.TaskSucceeded {
		t.Errorf("status = %q, want succeeded", got.Status)
	}
	if len(got.Logs) != 1 || got.Logs[0].Message != "doing work" {
		t.Errorf("unexpected logs: %+v", got.Logs)
	}
}

func TestEngineTaskFailure(t *testing.T) {
	st := newTestStore(t)
	eng := New(st, context.Background())

	task, err := eng.Create("test.failure", "example.com", func(ctx context.Context, log LogFunc) error {
		return errors.New("command failed")
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	eng.Wait()

	got, ok := eng.Get(task.ID)
	if !ok {
		t.Fatalf("Get(%s) not found", task.ID)
	}
	if got.Status != store.TaskFailed {
		t.Errorf("status = %q, want failed", got.Status)
	}
	if got.Error == nil || *got.Error != "command failed" {
		t.Errorf("unexpected error: %v", got.Error)
	}
}

func TestEngineTaskPanicRecovery(t *testing.T) {
	st := newTestStore(t)
	eng := New(st, context.Background())

	task, err := eng.Create("test.panic", "example.com", func(ctx context.Context, log LogFunc) error {
		panic("nil pointer dereference simulation")
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	eng.Wait()

	got, ok := eng.Get(task.ID)
	if !ok {
		t.Fatalf("Get(%s) not found", task.ID)
	}
	if got.Status != store.TaskFailed {
		t.Errorf("status = %q, want failed", got.Status)
	}
	if got.Error == nil || *got.Error != "task panicked: nil pointer dereference simulation" {
		t.Errorf("unexpected error: %v", got.Error)
	}
	if len(got.Logs) == 0 {
		t.Error("expected error log entry for panic")
	}
}
