package server

import (
	"fmt"
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// handleDiagnoseSite executes automated diagnostics on a site.
func (s *Server) handleDiagnoseSite(w http.ResponseWriter, r *http.Request) {
	if s.doctor == nil {
		writeError(w, apierr.Internal("doctor service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	site, err := s.sites.Get(domain)
	if err != nil {
		writeError(w, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain)))
		return
	}

	diag := s.doctor.DiagnoseSite(r.Context(), site)
	writeJSON(w, http.StatusOK, diag)
}

// handleFixSiteIssue applies an automated remediation action for a site defect.
func (s *Server) handleFixSiteIssue(w http.ResponseWriter, r *http.Request) {
	if s.doctor == nil {
		writeError(w, apierr.Internal("doctor service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	site, err := s.sites.Get(domain)
	if err != nil {
		writeError(w, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain)))
		return
	}

	var req struct {
		FixType string `json:"fixType"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	fixType := strings.TrimSpace(req.FixType)
	if fixType == "" {
		writeError(w, apierr.BadRequest("missing_fix_type", "fixType field is required"))
		return
	}

	message, err := s.doctor.FixSiteIssue(r.Context(), site, fixType)
	if err != nil {
		writeError(w, apierr.Internal("failed to apply fix: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"domain":  domain,
		"fixType": fixType,
		"message": message,
	})
}

// handleDiagnoseServer executes host-wide diagnostics.
func (s *Server) handleDiagnoseServer(w http.ResponseWriter, r *http.Request) {
	if s.doctor == nil {
		writeError(w, apierr.Internal("doctor service is not initialized"))
		return
	}
	diag := s.doctor.DiagnoseServer(r.Context())
	writeJSON(w, http.StatusOK, diag)
}

// handleFixServerIssue applies a host-wide remediation action.
func (s *Server) handleFixServerIssue(w http.ResponseWriter, r *http.Request) {
	if s.doctor == nil {
		writeError(w, apierr.Internal("doctor service is not initialized"))
		return
	}
	var req struct {
		FixType string `json:"fixType"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	fixType := strings.TrimSpace(req.FixType)
	if fixType == "" {
		writeError(w, apierr.BadRequest("missing_fix_type", "fixType field is required"))
		return
	}

	message, err := s.doctor.FixServerIssue(r.Context(), fixType)
	if err != nil {
		writeError(w, apierr.Internal("failed to apply server fix: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"fixType": fixType,
		"message": message,
	})
}

// handleInvestigateSiteLogs reads recent error logs and performs AI root-cause analysis with actionable remediation.
func (s *Server) handleInvestigateSiteLogs(w http.ResponseWriter, r *http.Request) {
	if s.doctor == nil {
		writeError(w, apierr.Internal("doctor service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	site, err := s.sites.Get(domain)
	if err != nil {
		writeError(w, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain)))
		return
	}

	var req struct {
		LogContent string `json:"logContent"`
	}
	_ = decodeBody(w, r, &req)

	inv, err := s.doctor.InvestigateLogs(r.Context(), site, req.LogContent)
	if err != nil {
		writeError(w, apierr.Internal("failed to investigate logs: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, inv)
}
