package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/dns"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/sites"
)

func (s *Server) handleGetDNSNameservers(w http.ResponseWriter, r *http.Request) {
	if s.dns == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "dns_unavailable", "dns service is not configured"))
		return
	}
	writeJSON(w, http.StatusOK, s.dns.GetNameservers(r.Context()))
}

func (s *Server) handleSetDNSNameservers(w http.ResponseWriter, r *http.Request) {
	if s.dns == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "dns_unavailable", "dns service is not configured"))
		return
	}
	var req struct {
		Nameserver1 string `json:"nameserver1"`
		Nameserver2 string `json:"nameserver2"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.dns.SetNameservers(r.Context(), req.Nameserver1, req.Nameserver2); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.dns.GetNameservers(r.Context()))
}

func (s *Server) handleDNSMailSync(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		writeError(w, err)
		return
	}

	if s.dns == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "dns_unavailable", "dns service is not configured"))
		return
	}
	if s.mail == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "mail_unavailable", "mail service is not configured"))
		return
	}

	ctx := r.Context()

	// 1) Checks if PowerDNS zone exists for domain. If not, calls dns.CreateZone.
	zones, err := s.dns.Zones(ctx)
	if err != nil {
		writeError(w, err)
		return
	}
	zoneExists := false
	for _, z := range zones {
		if strings.EqualFold(z.Name, normalized) {
			zoneExists = true
			break
		}
	}
	dnsZoneCreated := false
	if !zoneExists {
		if _, err := s.dns.CreateZone(ctx, normalized); err != nil {
			writeError(w, err)
			return
		}
		dnsZoneCreated = true
	}

	// 2) Checks if mail domain exists in mail service. If not, adds mail domain.
	mailDomains, err := s.mail.ListDomains()
	if err != nil {
		writeError(w, err)
		return
	}
	mailDomainExists := false
	for _, d := range mailDomains {
		if strings.EqualFold(d, normalized) {
			mailDomainExists = true
			break
		}
	}
	mailDomainCreated := false
	if !mailDomainExists {
		if err := s.mail.AddDomain(normalized); err != nil {
			writeError(w, err)
			return
		}
		mailDomainCreated = true
	}

	// 3) Calls mail.ApplyDNS(ctx, domain, DNSOptions{SPF: true, DMARCPolicy: "none", DKIM: true, MX: true}).
	dnsRes, err := s.mail.ApplyDNS(ctx, normalized, mail.DNSOptions{
		SPF:         true,
		DMARCPolicy: "none",
		DKIM:        true,
		MX:          true,
	})
	if err != nil {
		writeError(w, err)
		return
	}

	dkimApplied := false
	if dnsRes.Applied != nil {
		if _, ok := dnsRes.Applied["dkim"]; ok {
			dkimApplied = true
		}
	}

	records, _ := s.dns.Records(ctx, normalized)
	if records == nil {
		records = []dns.Record{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"dnsZoneCreated":    dnsZoneCreated,
		"mailDomainCreated": mailDomainCreated,
		"dkimApplied":       dkimApplied,
		"records":           records,
	})
}

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
