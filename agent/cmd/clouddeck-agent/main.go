// Command clouddeck-agent is the privileged CloudDeck agent: it manages
// nginx sites, site files, MySQL databases, SSL certificates and host
// metrics behind a localhost HTTP API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/files"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/server"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/ssl"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

const shutdownTimeout = 10 * time.Second

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("clouddeck-agent: config: %v", err)
	}
	log.Printf("clouddeck-agent %s starting: listen=%s state-dir=%s nginx-sites=%s webroot=%s php-base=%s dry-run=%t",
		server.Version, cfg.Listen, cfg.StateDir, cfg.NginxSitesDir, cfg.Webroot, cfg.PHPBase, cfg.DryRun)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(cfg.StateDir)
	if err != nil {
		log.Fatalf("clouddeck-agent: %v", err)
	}
	auditLog, err := audit.Open(cfg.StateDir)
	if err != nil {
		log.Fatalf("clouddeck-agent: %v", err)
	}

	eng := tasks.New(st, ctx)
	siteSvc := sites.New(st, eng, auditLog, cfg)
	sslIssuer := ssl.New(st, siteSvc, eng, auditLog, cfg)
	fileSvc := files.New(st, auditLog, cfg)
	mysqlSvc := mysql.New(auditLog, cfg)

	if cfg.DryRun {
		log.Printf("clouddeck-agent: dry-run mode, skipping reconciliation")
	} else {
		siteSvc.Reconcile()
	}

	srv := &http.Server{
		Addr:    cfg.Listen,
		Handler: server.New(cfg, eng, siteSvc, sslIssuer, fileSvc, mysqlSvc),
	}
	go func() {
		<-ctx.Done()
		log.Printf("clouddeck-agent: shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("clouddeck-agent: http shutdown: %v", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("clouddeck-agent: listen: %v", err)
	}

	done := make(chan struct{})
	go func() {
		eng.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(shutdownTimeout):
		log.Printf("clouddeck-agent: timed out waiting for running tasks")
	}
	log.Printf("clouddeck-agent: stopped")
}
