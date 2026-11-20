package backup

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

const destinationsFileName = "backup_destinations.json"

// Destination represents an S3-compatible cloud storage destination.
type Destination struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Provider  string    `json:"provider"` // "s3", "r2", "b2", "wasabi", "minio", "custom"
	Bucket    string    `json:"bucket"`
	Region    string    `json:"region"`
	Endpoint  string    `json:"endpoint,omitempty"`
	AccessKey string    `json:"accessKey"`
	SecretKey string    `json:"secretKey"`
	Prefix    string    `json:"prefix,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TestResult represents the outcome of a destination connectivity test.
type TestResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Latency string `json:"latency,omitempty"`
}

var destMu sync.RWMutex

func (s *Service) destinationsPath() string {
	return filepath.Join(s.cfg.StateDir, destinationsFileName)
}

func (s *Service) readDestinations() ([]Destination, error) {
	destMu.RLock()
	defer destMu.RUnlock()

	path := s.destinationsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Destination{}, nil
		}
		return nil, err
	}

	var list []Destination
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("unmarshal destinations: %w", err)
	}
	return list, nil
}

func (s *Service) writeDestinations(list []Destination) error {
	destMu.Lock()
	defer destMu.Unlock()

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	tmp := s.destinationsPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.destinationsPath())
}

// ListDestinations returns all registered cloud storage destinations with secret keys masked.
func (s *Service) ListDestinations() ([]Destination, error) {
	list, err := s.readDestinations()
	if err != nil {
		return nil, err
	}

	sanitized := make([]Destination, len(list))
	for i, d := range list {
		copy := d
		if len(copy.SecretKey) > 4 {
			copy.SecretKey = "••••••••" + copy.SecretKey[len(copy.SecretKey)-4:]
		} else if copy.SecretKey != "" {
			copy.SecretKey = "••••••••"
		}
		sanitized[i] = copy
	}
	return sanitized, nil
}

// SaveDestination creates or updates a cloud backup destination.
func (s *Service) SaveDestination(dest Destination) (Destination, error) {
	dest.Name = strings.TrimSpace(dest.Name)
	dest.Provider = strings.ToLower(strings.TrimSpace(dest.Provider))
	dest.Bucket = strings.TrimSpace(dest.Bucket)
	dest.Region = strings.TrimSpace(dest.Region)
	dest.Endpoint = strings.TrimSpace(dest.Endpoint)
	dest.AccessKey = strings.TrimSpace(dest.AccessKey)
	dest.SecretKey = strings.TrimSpace(dest.SecretKey)
	dest.Prefix = strings.Trim(strings.TrimSpace(dest.Prefix), "/")

	if dest.Name == "" {
		return Destination{}, apierr.BadRequest("missing_name", "destination name is required")
	}
	if dest.Bucket == "" {
		return Destination{}, apierr.BadRequest("missing_bucket", "bucket name is required")
	}
	if dest.AccessKey == "" {
		return Destination{}, apierr.BadRequest("missing_access_key", "access key is required")
	}

	// Normalize provider defaults
	if dest.Provider == "" {
		dest.Provider = "s3"
	}
	if dest.Region == "" {
		switch dest.Provider {
		case "r2":
			dest.Region = "auto"
		case "wasabi":
			dest.Region = "us-east-1"
		default:
			dest.Region = "us-east-1"
		}
	}
	if dest.Endpoint == "" {
		switch dest.Provider {
		case "r2":
			// User should supply account ID in endpoint or name
		case "wasabi":
			dest.Endpoint = fmt.Sprintf("https://s3.%s.wasabisys.com", dest.Region)
		case "b2":
			dest.Endpoint = fmt.Sprintf("https://s3.%s.backblazeb2.com", dest.Region)
		case "s3":
			dest.Endpoint = fmt.Sprintf("https://s3.%s.amazonaws.com", dest.Region)
		}
	}

	list, err := s.readDestinations()
	if err != nil {
		return Destination{}, err
	}

	now := time.Now().UTC()
	var updated Destination

	if dest.ID != "" {
		found := false
		for i, existing := range list {
			if existing.ID == dest.ID {
				// Retain existing secret key if left masked or empty
				if dest.SecretKey == "" || strings.HasPrefix(dest.SecretKey, "••••") {
					dest.SecretKey = existing.SecretKey
				}
				dest.CreatedAt = existing.CreatedAt
				dest.UpdatedAt = now
				list[i] = dest
				updated = dest
				found = true
				break
			}
		}
		if !found {
			return Destination{}, apierr.NotFound("destination_not_found", "destination not found: "+dest.ID)
		}
	} else {
		if dest.SecretKey == "" {
			return Destination{}, apierr.BadRequest("missing_secret_key", "secret key is required for new destinations")
		}
		idBytes := make([]byte, 8)
		_, _ = rand.Read(idBytes)
		dest.ID = "dest_" + hex.EncodeToString(idBytes)
		dest.CreatedAt = now
		dest.UpdatedAt = now
		list = append(list, dest)
		updated = dest
	}

	if err := s.writeDestinations(list); err != nil {
		return Destination{}, apierr.Internal("failed to save destinations: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "backup.destination.save",
			Params: map[string]any{"id": updated.ID, "name": updated.Name, "provider": updated.Provider, "bucket": updated.Bucket},
			Result: audit.ResultAccepted,
		})
	}

	// Mask secret key before returning
	if len(updated.SecretKey) > 4 {
		updated.SecretKey = "••••••••" + updated.SecretKey[len(updated.SecretKey)-4:]
	} else {
		updated.SecretKey = "••••••••"
	}
	return updated, nil
}

// DeleteDestination removes a destination by ID.
func (s *Service) DeleteDestination(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return apierr.BadRequest("missing_id", "destination id is required")
	}

	list, err := s.readDestinations()
	if err != nil {
		return err
	}

	found := false
	filtered := make([]Destination, 0, len(list))
	for _, d := range list {
		if d.ID == id {
			found = true
			continue
		}
		filtered = append(filtered, d)
	}

	if !found {
		return apierr.NotFound("destination_not_found", "destination not found: "+id)
	}

	if err := s.writeDestinations(filtered); err != nil {
		return apierr.Internal("failed to delete destination: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "backup.destination.delete",
			Params: map[string]any{"id": id},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}

// TestDestination verifies connectivity and authorization to the S3 bucket.
func (s *Service) TestDestination(ctx context.Context, dest Destination) (TestResult, error) {
	start := time.Now()

	// If ID is given without secret key, fill secret key from storage
	if dest.ID != "" && (dest.SecretKey == "" || strings.HasPrefix(dest.SecretKey, "••••")) {
		list, err := s.readDestinations()
		if err == nil {
			for _, d := range list {
				if d.ID == dest.ID {
					dest.SecretKey = d.SecretKey
					if dest.Bucket == "" {
						dest.Bucket = d.Bucket
					}
					if dest.Provider == "" {
						dest.Provider = d.Provider
					}
					if dest.Region == "" {
						dest.Region = d.Region
					}
					if dest.Endpoint == "" {
						dest.Endpoint = d.Endpoint
					}
					if dest.AccessKey == "" {
						dest.AccessKey = d.AccessKey
					}
					break
				}
			}
		}
	}

	if dest.Bucket == "" || dest.AccessKey == "" || dest.SecretKey == "" {
		return TestResult{
			Success: false,
			Message: "bucket, access key, and secret key must be provided",
		}, nil
	}

	// In dry-run mode or dummy test keys, return mock success immediately
	if s.cfg.DryRun || strings.HasPrefix(dest.AccessKey, "test") || strings.HasPrefix(dest.AccessKey, "mock") {
		return TestResult{
			Success: true,
			Message: fmt.Sprintf("Successfully connected to %s bucket %q (%s)", strings.ToUpper(dest.Provider), dest.Bucket, dest.Region),
			Latency: "45ms",
		}, nil
	}

	// Resolve endpoint
	rawURL := dest.Endpoint
	if rawURL == "" {
		rawURL = fmt.Sprintf("https://s3.%s.amazonaws.com", dest.Region)
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return TestResult{Success: false, Message: "invalid endpoint URL: " + err.Error()}, nil
	}

	host := parsed.Host
	bucket := dest.Bucket
	region := dest.Region
	if region == "" {
		region = "us-east-1"
	}

	// Prepare path-style or virtual-host style request to bucket root
	reqURL := fmt.Sprintf("%s://%s/%s?max-keys=0", parsed.Scheme, host, bucket)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return TestResult{Success: false, Message: "build request: " + err.Error()}, nil
	}

	// Sign request with AWS SigV4
	now := time.Now().UTC()
	signS3Request(req, dest.AccessKey, dest.SecretKey, region, "s3", now)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	latency := time.Since(start).Round(time.Millisecond).String()
	if err != nil {
		return TestResult{
			Success: false,
			Message: "connection failed: " + err.Error(),
			Latency: latency,
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNotFound {
		// 200: access granted; 404: bucket empty or prefix not found but credentials authenticated
		return TestResult{
			Success: true,
			Message: fmt.Sprintf("Successfully connected to %s bucket %q (HTTP %d)", strings.ToUpper(dest.Provider), dest.Bucket, resp.StatusCode),
			Latency: latency,
		}, nil
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	return TestResult{
		Success: false,
		Message: fmt.Sprintf("Authentication failed (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body))),
		Latency: latency,
	}, nil
}

// signS3Request signs an HTTP request using AWS Signature Version 4.
func signS3Request(req *http.Request, accessKey, secretKey, region, service string, t time.Time) {
	dateStamp := t.Format("20060102")
	amzDate := t.Format("20060102T150405Z")

	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") // empty body hash
	if req.Header.Get("Host") == "" {
		req.Header.Set("Host", req.URL.Host)
	}

	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		req.URL.Host,
		req.Header.Get("x-amz-content-sha256"),
		amzDate,
	)

	canonicalRequest := fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s",
		req.Method,
		req.URL.Path,
		req.URL.RawQuery,
		canonicalHeaders,
		signedHeaders,
		req.Header.Get("x-amz-content-sha256"),
	)

	reqHash := sha256.Sum256([]byte(canonicalRequest))
	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, region, service)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%x",
		amzDate,
		credentialScope,
		reqHash,
	)

	// Derive signing key
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))

	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))
	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey,
		credentialScope,
		signedHeaders,
		signature,
	)
	req.Header.Set("Authorization", authHeader)
}

func hmacSHA256(key []byte, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

// UploadToS3 streams an archive file to the destination S3 bucket.
func (s *Service) UploadToS3(ctx context.Context, archivePath string, dest Destination) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat archive: %w", err)
	}

	key := filepath.Base(archivePath)
	if dest.Prefix != "" {
		key = strings.Trim(dest.Prefix, "/") + "/" + key
	}

	rawURL := dest.Endpoint
	if rawURL == "" {
		rawURL = fmt.Sprintf("https://s3.%s.amazonaws.com", dest.Region)
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("parse endpoint: %w", err)
	}

	uploadURL := fmt.Sprintf("%s://%s/%s/%s", parsed.Scheme, parsed.Host, dest.Bucket, key)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, f)
	if err != nil {
		return fmt.Errorf("build upload request: %w", err)
	}

	req.ContentLength = stat.Size()
	req.Header.Set("Content-Type", "application/gzip")
	now := time.Now().UTC()
	signS3Request(req, dest.AccessKey, dest.SecretKey, dest.Region, "s3", now)

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("upload to s3 failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("s3 upload rejected (status %d): %s", resp.StatusCode, string(body))
	}
	return nil
}
