// Package tasks runs agent mutations asynchronously and records their logs.
package tasks

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	stdlog "log"
	"sync"
	"time"

	"clouddeck/agent/internal/store"
)

// LogFunc receives one log line from a running task.
type LogFunc func(level, message string)

// RunFunc is the work a task performs.
type RunFunc func(ctx context.Context, log LogFunc) error

// Engine schedules tasks and serializes site-mutating work through a single
// mutex, which is fine at v0.1 scale.
type Engine struct {
	st   *store.Store
	base context.Context
	mu   sync.Mutex
	wg   sync.WaitGroup
}

// New creates an engine whose tasks are canceled when base is canceled.
func New(st *store.Store, base context.Context) *Engine {
	return &Engine{st: st, base: base}
}

// Create persists a pending task and starts it in the background.
func (e *Engine) Create(taskType, site string, fn RunFunc) (store.Task, error) {
	task := store.Task{
		ID:        newID(),
		Type:      taskType,
		Site:      site,
		Status:    store.TaskPending,
		CreatedAt: store.Now(),
		Logs:      []store.LogEntry{},
	}
	if err := e.st.AddTask(task); err != nil {
		return store.Task{}, fmt.Errorf("create task: %w", err)
	}
	e.wg.Add(1)
	go e.run(task.ID, fn)
	return task, nil
}

// Get returns one task including logs.
func (e *Engine) Get(id string) (store.Task, bool) {
	return e.st.GetTask(id)
}

// List returns the newest tasks, at most 50.
func (e *Engine) List() []store.Task {
	list := e.st.ListTasks()
	if len(list) > 50 {
		list = list[:50]
	}
	return list
}

// Wait blocks until every running task has finished.
func (e *Engine) Wait() {
	e.wg.Wait()
}

func (e *Engine) run(id string, fn RunFunc) {
	defer e.wg.Done()
	e.mu.Lock()
	defer e.mu.Unlock()

	started := store.Now()
	e.update(id, func(t *store.Task) {
		t.Status = store.TaskRunning
		t.StartedAt = &started
	})
	emit := func(level, message string) {
		entry := store.LogEntry{At: store.Now(), Level: level, Message: message}
		if err := e.st.AppendTaskLog(id, entry); err != nil {
			stdlog.Printf("tasks: append log to %s: %v", id, err)
		}
	}

	runErr := fn(e.base, emit)

	finished := store.Now()
	e.update(id, func(t *store.Task) {
		t.FinishedAt = &finished
		if runErr != nil {
			t.Status = store.TaskFailed
			message := runErr.Error()
			t.Error = &message
		} else {
			t.Status = store.TaskSucceeded
		}
	})
}

func (e *Engine) update(id string, mutate func(*store.Task)) {
	if err := e.st.UpdateTask(id, mutate); err != nil {
		stdlog.Printf("tasks: update %s: %v", id, err)
	}
}

func newID() string {
	buf := make([]byte, 3)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("t_%06x", uint64(time.Now().UnixNano())&0xffffff)
	}
	return "t_" + hex.EncodeToString(buf)
}
