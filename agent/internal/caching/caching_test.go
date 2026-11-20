package caching

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestCachingServiceDryRun(t *testing.T) {
	svc := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()

	// 1. Status probe should not crash
	st := svc.Status(ctx)
	if st.Redis.Port != 6379 {
		t.Fatalf("expected redis port 6379, got %d", st.Redis.Port)
	}

	// 2. Dry run flush
	if err := svc.Flush(ctx); err != nil {
		t.Fatalf("expected nil err in dry-run flush, got: %v", err)
	}

	// 3. Dry run toggle
	for _, act := range []string{"start", "stop", "restart"} {
		if err := svc.Toggle(ctx, act); err != nil {
			t.Fatalf("expected nil err in dry-run toggle %s, got: %v", act, err)
		}
	}

	// 4. Invalid action
	if err := svc.Toggle(ctx, "invalid_action"); err == nil {
		t.Fatalf("expected error for invalid action, got nil")
	}
}

func TestFetchRedisInfo(t *testing.T) {
	// Setup mock TCP Redis listener
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer listener.Close()

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		reader := bufio.NewReader(conn)
		cmd, _ := reader.ReadString('\n')
		if cmd == "INFO\r\n" {
			infoPayload := "$120\r\n" +
				"# Server\r\n" +
				"redis_version:7.2.4\r\n" +
				"# Memory\r\n" +
				"used_memory_human:12.34M\r\n" +
				"used_memory_peak_human:15.67M\r\n" +
				"maxmemory_human:512M\r\n" +
				"# Clients\r\n" +
				"connected_clients:4\r\n" +
				"uptime_in_days:10\r\n" +
				"# Keyspace\r\n" +
				"db0:keys=142,expires=10\r\n" +
				"db1:keys=58,expires=0\r\n"
			fmt.Fprintf(conn, "%s", infoPayload)
		}
	}()

	clientConn, err := net.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatalf("client dial failed: %v", err)
	}
	defer clientConn.Close()

	info := fetchRedisInfo(clientConn)
	if info["redis_version"] != "7.2.4" {
		t.Fatalf("expected redis_version 7.2.4, got %q", info["redis_version"])
	}
	if info["used_memory_human"] != "12.34M" {
		t.Fatalf("expected used_memory_human 12.34M, got %q", info["used_memory_human"])
	}
	if info["connected_clients"] != "4" {
		t.Fatalf("expected 4 connected clients, got %q", info["connected_clients"])
	}
}
