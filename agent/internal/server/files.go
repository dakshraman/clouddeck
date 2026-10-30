package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/files"
)

// maxFileWriteBody is larger than maxBodyBytes because a 2 MiB content limit
// (content) plus JSON escaping must still fit through the decoder.
const maxFileWriteBody = 16 << 20

func (s *Server) handleFileList(w http.ResponseWriter, r *http.Request) {
	path, entries, err := s.files.List(r.PathValue("domain"), r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": path, "entries": entries})
}

func (s *Server) handleFileRead(w http.ResponseWriter, r *http.Request) {
	rel := r.URL.Query().Get("path")
	if !r.URL.Query().Has("path") {
		writeError(w, requiredPath())
		return
	}
	result, err := s.files.Read(r.PathValue("domain"), rel)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleFileWrite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxFileWriteBody))
	if err := dec.Decode(&req); err != nil {
		writeError(w, apierr.BadRequest("invalid_json", fmt.Sprintf("invalid request body: %v", err)))
		return
	}
	result, err := s.files.Write(r.PathValue("domain"), req.Path, req.Content)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleFileDownload(w http.ResponseWriter, r *http.Request) {
	rel := r.URL.Query().Get("path")
	if !r.URL.Query().Has("path") {
		writeError(w, requiredPath())
		return
	}
	dl, err := s.files.Download(r.PathValue("domain"), rel)
	if err != nil {
		writeError(w, err)
		return
	}
	f, err := os.Open(dl.Path)
	if err != nil {
		writeError(w, apierr.Internal(fmt.Sprintf("open download: %v", err)))
		return
	}
	defer f.Close()
	w.Header().Set("Content-Disposition", contentDisposition(dl.Name))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, dl.Name, dl.ModifiedAt, f)
}

func (s *Server) handleFileUpload(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	target := query.Get("path")
	overwrite := query.Get("overwrite") == "true"

	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("invalid multipart body: %v", err)))
		return
	}
	uploaded := []files.UploadedFile{}
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("read multipart body: %v", err)))
			return
		}
		if part.FormName() != "file" {
			part.Close()
			writeError(w, apierr.BadRequest("bad_name", fmt.Sprintf("multipart field %q: expected %q", part.FormName(), "file")))
			return
		}
		up, err := s.files.Upload(r.PathValue("domain"), target, part.FileName(), part, overwrite)
		part.Close()
		if err != nil {
			writeError(w, err)
			return
		}
		uploaded = append(uploaded, up)
	}
	if len(uploaded) == 0 {
		writeError(w, apierr.BadRequest("invalid_multipart", "no file parts in multipart body"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"uploaded": uploaded})
}

func (s *Server) handleFileMkdir(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	path, err := s.files.Mkdir(r.PathValue("domain"), req.Path)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"path": path})
}

func (s *Server) handleFileRename(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	from, to, err := s.files.Rename(r.PathValue("domain"), req.From, req.To)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": from, "to": to})
}

func (s *Server) handleFileDelete(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if !query.Has("path") {
		writeError(w, requiredPath())
		return
	}
	path, err := s.files.Delete(r.PathValue("domain"), query.Get("path"), query.Get("recursive") == "true")
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": path, "deleted": true})
}

func requiredPath() error {
	return apierr.BadRequest("invalid_path", `query parameter "path" is required`)
}

// contentDisposition builds a quoted attachment filename, replacing control
// characters, quotes and backslashes so the header stays well-formed.
func contentDisposition(name string) string {
	clean := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	if clean == "" {
		clean = "download"
	}
	return `attachment; filename="` + clean + `"`
}
