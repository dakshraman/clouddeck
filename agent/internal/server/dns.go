package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
)

func (s *Server) handleDNSStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.dns.Status(r.Context()))
}

func (s *Server) handleListDNSZones(w http.ResponseWriter, r *http.Request) {
	zones, err := s.dns.Zones(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"zones": zones})
}

func (s *Server) handleCreateDNSZone(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	zone, err := s.dns.CreateZone(r.Context(), req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"zone": zone})
}

func (s *Server) handleDeleteDNSZone(w http.ResponseWriter, r *http.Request) {
	zone := r.PathValue("zone")
	if err := s.dns.DeleteZone(r.Context(), zone); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"zone": zone, "deleted": true})
}

func (s *Server) handleListDNSRecords(w http.ResponseWriter, r *http.Request) {
	records, err := s.dns.Records(r.Context(), r.PathValue("zone"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"records": records})
}

func (s *Server) handleAddDNSRecord(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		Type    string `json:"type"`
		Content string `json:"content"`
		TTL     int    `json:"ttl"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	record, err := s.dns.AddRecord(r.Context(), r.PathValue("zone"), req.Name, req.Type, req.Content, req.TTL)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"record": record})
}

func (s *Server) handleDeleteDNSRecord(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	name, rtype := query.Get("name"), query.Get("type")
	if name == "" || rtype == "" {
		writeError(w, apierr.BadRequest("invalid_record", "name and type query parameters are required"))
		return
	}
	if err := s.dns.DeleteRRSet(r.Context(), r.PathValue("zone"), name, rtype); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "type": rtype, "deleted": true})
}
