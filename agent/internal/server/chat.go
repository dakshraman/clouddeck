package server

import (
	"fmt"
	"net/http"
	"runtime"
	"strings"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/apierr"
)

// handleAgentChat handles interactive AI chat queries with contextual host details.
func (s *Server) handleAgentChat(w http.ResponseWriter, r *http.Request) {
	var req agents.ChatRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		writeError(w, apierr.BadRequest("missing_prompt", "prompt field is required"))
		return
	}

	var siteDomains []string
	if s.sites != nil {
		for _, site := range s.sites.List() {
			siteDomains = append(siteDomains, site.Domain)
		}
	}

	sysCtx := fmt.Sprintf("CloudDeck Server (%s/%s). Registered Sites (%d): %s.",
		runtime.GOOS, runtime.GOARCH, len(siteDomains), strings.Join(siteDomains, ", "))

	resp, err := s.agents.Chat(r.Context(), req, sysCtx)
	if err != nil {
		writeError(w, apierr.Internal("chat failed: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, resp)
}
