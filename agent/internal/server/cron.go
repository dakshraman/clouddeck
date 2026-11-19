package server

import (
	"net/http"
	"strconv"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/cron"
)

// SetCron configures the cron service.
func (s *Server) SetCron(c *cron.Service) {
	s.cron = c
}

func (s *Server) checkCron(w http.ResponseWriter) bool {
	if s.cron == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "cron_unavailable", "cron service is not available"))
		return false
	}
	return true
}

func (s *Server) handleListCronJobs(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	jobs := s.cron.List()
	resp := map[string]any{
		"jobs": jobs,
	}
	if s.sites != nil {
		resp["sites"] = nonNilSlice(s.sites.AllCron())
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetCronJob(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	id := r.PathValue("id")
	job, err := s.cron.Get(id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job})
}

func (s *Server) handleCreateCronJob(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	var req cron.AddJobRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	job, err := s.cron.Add(req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"job": job})
}

func (s *Server) handleUpdateCronJob(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	id := r.PathValue("id")
	var req cron.UpdateJobRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	job, err := s.cron.Update(id, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job": job})
}

func (s *Server) handleDeleteCronJob(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	id := r.PathValue("id")
	if err := s.cron.Delete(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "id": id})
}

func (s *Server) handleRunCronJob(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	id := r.PathValue("id")
	res, err := s.cron.Run(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleCronHistory(w http.ResponseWriter, r *http.Request) {
	if !s.checkCron(w) {
		return
	}
	jobID := r.URL.Query().Get("job_id")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	history := s.cron.GetHistory(jobID, limit)
	writeJSON(w, http.StatusOK, map[string]any{"history": history})
}

func (s *Server) handleCronPresets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"presets": cron.AvailablePresets})
}
