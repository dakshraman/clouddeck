package server

import (
	"fmt"
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/ssl"
)

// handleListSSLProviders returns the supported DNS-01 verification providers.
func (s *Server) handleListSSLProviders(w http.ResponseWriter, r *http.Request) {
	if s.ssl == nil {
		writeError(w, apierr.Internal("ssl service is not configured"))
		return
	}

	providers := s.ssl.ListDNSProviders()
	writeJSON(w, http.StatusOK, map[string]any{"providers": providers})
}

// handleIssueWildcardSSL provisions a wildcard certificate for *.domain using DNS-01 ACME challenge.
func (s *Server) handleIssueWildcardSSL(w http.ResponseWriter, r *http.Request) {
	if s.ssl == nil {
		writeError(w, apierr.Internal("ssl service is not configured"))
		return
	}

	domain := r.PathValue("domain")
	var req ssl.WildcardRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	res, err := s.ssl.IssueWildcard(r.Context(), domain, req)
	if err != nil {
		writeError(w, apierr.Internal(fmt.Sprintf("wildcard issuance: %v", err)))
		return
	}

	writeJSON(w, http.StatusOK, res)
}
