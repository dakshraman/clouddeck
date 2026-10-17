// v0.5 handlers: FTP accounts, web terminal, SSH keys, phpMyAdmin, remote
// MySQL hosts, aggregate cron, per-site WAF and file-manager actions.
// See docs/api.md section 1.9.
package server

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/ftp"
)

// nonNilSlice returns a non-nil copy so JSON responses use [] instead of null.
func nonNilSlice[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}

// ---- FTP accounts ----

func (s *Server) handleFTPStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.ftp.Status())
}

func (s *Server) handleFTPList(w http.ResponseWriter, r *http.Request) {
	s.writeFTPAccounts(w)
}

func (s *Server) handleFTPCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Site     string `json:"site"`
		Subdir   string `json:"subdir"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	site, err := s.sites.Get(req.Site)
	if err != nil {
		writeError(w, err)
		return
	}
	if _, err := s.ftp.Create(site.Root, req.Subdir, req.Name, req.Password); err != nil {
		writeError(w, err)
		return
	}
	s.writeFTPAccounts(w)
}

func (s *Server) handleFTPDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.ftp.Delete(r.PathValue("name")); err != nil {
		writeError(w, err)
		return
	}
	s.writeFTPAccounts(w)
}

func (s *Server) handleFTPSetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.ftp.SetPassword(r.PathValue("name"), req.Password); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeFTPAccounts responds with the full (site-annotated) account list.
func (s *Server) writeFTPAccounts(w http.ResponseWriter) {
	accounts, err := s.ftp.List()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": s.withFTPSite(accounts)})
}

// withFTPSite annotates each account with the site that owns its home dir.
func (s *Server) withFTPSite(accounts []ftp.Account) []ftp.Account {
	accounts = nonNilSlice(accounts)
	list := s.sites.List()
	for i := range accounts {
		best := ""
		for _, site := range list {
			root := strings.TrimSuffix(site.Root, "/")
			if root == "" || !strings.HasPrefix(accounts[i].Home, root) {
				continue
			}
			if accounts[i].Home != root && !strings.HasPrefix(accounts[i].Home, root+"/") {
				continue
			}
			if len(root) > len(best) {
				best = root
				accounts[i].Site = site.Domain
				accounts[i].Subdir = strings.TrimPrefix(accounts[i].Home[len(root):], "/")
			}
		}
	}
	return accounts
}

// ---- web terminal ----

func (s *Server) handleTermStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.term.Status())
}

func (s *Server) handleTermStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cols int `json:"cols"`
		Rows int `json:"rows"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	session, err := s.term.Start(req.Cols, req.Rows)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) handleTermInput(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Data string `json:"data"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	raw, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		writeError(w, apierr.BadRequest("invalid_input", "data must be base64"))
		return
	}
	if err := s.term.Input(r.PathValue("id"), raw); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTermResize(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Cols int `json:"cols"`
		Rows int `json:"rows"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.term.Resize(r.PathValue("id"), req.Cols, req.Rows); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleTermDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.term.Close(r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTermStream relays the session's PTY output as Server-Sent Events:
// event "out" carries base64 chunks, event "exit" the final exit code.
func (s *Server) handleTermStream(w http.ResponseWriter, r *http.Request) {
	backlog, events, cancel, err := s.term.Attach(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	defer cancel()

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, apierr.Internal("streaming is not supported by this server"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	writeOut := func(data []byte) {
		fmt.Fprintf(w, "event: out\ndata: %s\n\n", base64.StdEncoding.EncodeToString(data))
	}
	if len(backlog) > 0 {
		writeOut(backlog)
	}
	flusher.Flush()

	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case event, open := <-events:
			if !open {
				fmt.Fprint(w, "event: exit\ndata: 0\n\n")
				flusher.Flush()
				return
			}
			if len(event.Data) > 0 {
				writeOut(event.Data)
			}
			if event.Exit != nil {
				fmt.Fprintf(w, "event: exit\ndata: %d\n\n", *event.Exit)
				flusher.Flush()
				return
			}
			flusher.Flush()
		}
	}
}

// ---- SSH keys ----

func (s *Server) handleSSHStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.ssh.Status())
}

func (s *Server) handleSSHListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := s.ssh.List()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": nonNilSlice(keys)})
}

func (s *Server) handleSSHAddKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key string `json:"key"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	key, err := s.ssh.Add(req.Key)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": key})
}

func (s *Server) handleSSHDeleteKey(w http.ResponseWriter, r *http.Request) {
	fingerprint := r.URL.Query().Get("fingerprint")
	if fingerprint == "" {
		writeError(w, apierr.BadRequest("invalid_fingerprint", "fingerprint query parameter is required"))
		return
	}
	if err := s.ssh.Delete(fingerprint); err != nil {
		writeError(w, err)
		return
	}
	keys, err := s.ssh.List()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": nonNilSlice(keys)})
}

func (s *Server) handleSSHListGenerated(w http.ResponseWriter, r *http.Request) {
	keys, err := s.ssh.ListGenerated()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": nonNilSlice(keys)})
}

func (s *Server) handleSSHGenerateKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		Type    string `json:"type"`
		Comment string `json:"comment"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	key, err := s.ssh.Generate(req.Name, req.Type, req.Comment)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": key})
}

func (s *Server) handleSSHReadGenerated(w http.ResponseWriter, r *http.Request) {
	key, err := s.ssh.ReadGenerated(r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key})
}

func (s *Server) handleSSHDeleteGenerated(w http.ResponseWriter, r *http.Request) {
	if err := s.ssh.DeleteGenerated(r.PathValue("name")); err != nil {
		writeError(w, err)
		return
	}
	keys, err := s.ssh.ListGenerated()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": nonNilSlice(keys)})
}

// ---- phpMyAdmin ----

func (s *Server) handlePHPMYADMINStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.pma.Status())
}

// ---- remote MySQL hosts ----

func (s *Server) handleMySQLListRemote(w http.ResponseWriter, r *http.Request) {
	users, err := s.mysql.RemoteHosts(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": nonNilSlice(users)})
}

func (s *Server) handleMySQLAddRemote(w http.ResponseWriter, r *http.Request) {
	var req struct {
		User string `json:"user"`
		Host string `json:"host"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	user, err := s.mysql.AddRemoteHost(r.Context(), req.User, req.Host)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (s *Server) handleMySQLDeleteRemote(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	user, err := s.mysql.DeleteRemoteHost(r.Context(), r.PathValue("user"), host)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// ---- aggregate cron + WAF ----

func (s *Server) handleListAllCron(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sites": nonNilSlice(s.sites.AllCron())})
}

func (s *Server) handleGetWAF(w http.ResponseWriter, r *http.Request) {
	info, err := s.sites.GetWAF(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleSetWAF(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	info, err := s.sites.SetWAF(r.PathValue("domain"), req.Enabled)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

// ---- file-manager actions ----

func (s *Server) handleFileChmod(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	path, err := s.files.Chmod(r.PathValue("domain"), req.Path, req.Mode)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": path})
}

func (s *Server) handleFileCopy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From      string `json:"from"`
		To        string `json:"to"`
		Overwrite bool   `json:"overwrite"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	from, to, err := s.files.Copy(r.PathValue("domain"), req.From, req.To, req.Overwrite)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": from, "to": to})
}

func (s *Server) handleFileCompress(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Paths  []string `json:"paths"`
		Format string   `json:"format"`
		Target string   `json:"target"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	target, err := s.files.Compress(r.PathValue("domain"), req.Paths, req.Format, req.Target)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": target})
}

func (s *Server) handleFileExtract(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Archive string `json:"archive"`
		Dest    string `json:"dest"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	dest, err := s.files.Extract(r.PathValue("domain"), req.Archive, req.Dest)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": dest})
}
