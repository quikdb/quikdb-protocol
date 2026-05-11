// Package server implements the CLI runner HTTP API.
// Each community node runs this server on port 4222, exposed via Cloudflare tunnel.
// The orchestrator sends deploy requests here to build and run containers via DinD.
package server

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"sync"
	"time"
)

// DeployRequest is sent by the orchestrator to build and start a container.
type DeployRequest struct {
	DeploymentID  string            `json:"deploymentId"`
	RepositoryURL string            `json:"repositoryUrl,omitempty"` // GitHub repo (Developer Mode)
	SourceURL     string            `json:"sourceUrl,omitempty"`     // R2 pre-signed URL (Builder Mode)
	Branch        string            `json:"branch"`
	DeployToken   string            `json:"deployToken"`
	Config        DeployConfig      `json:"config"`
	EnvVars       map[string]string `json:"envVars"`
}

// DeployConfig holds build and runtime configuration.
type DeployConfig struct {
	BuildCommand string `json:"buildCommand"`
	StartCommand string `json:"startCommand"`
	Port         int    `json:"port"`
	CPU          string `json:"cpu"`
	Memory       string `json:"memory"`
	Storage      string `json:"storage"`
}

// DeploymentState tracks the current state of a deployment on this node.
type DeploymentState struct {
	ID          string `json:"id"`
	Status      string `json:"status"` // pending, building, live, failed, stopped, sleeping
	CommitHash  string `json:"commitHash,omitempty"`
	Port        int    `json:"port"`
	ContainerID string `json:"containerId,omitempty"`
	Error       string `json:"error,omitempty"`
	StartedAt   int64  `json:"startedAt"`
}

var (
	deployments = make(map[string]*DeploymentState)
	mu          sync.RWMutex
	portMin     = 3000
	portMax     = 9999
)

// HandleDeploy creates a new deployment: clone/download source, build Docker image, start container.
func HandleDeploy(w http.ResponseWriter, r *http.Request) {
	var req DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Allocate port using actual net.Listen to detect collisions
	port, err := allocatePort()
	if err != nil {
		http.Error(w, "no ports available", http.StatusServiceUnavailable)
		return
	}

	state := &DeploymentState{
		ID:        req.DeploymentID,
		Status:    "pending",
		Port:      port,
		StartedAt: time.Now().Unix(),
	}

	mu.Lock()
	deployments[req.DeploymentID] = state
	mu.Unlock()

	// Run build and start async
	go func() {
		setState(req.DeploymentID, "building", "")

		// Step 1: Fetch source
		var commitHash string
		if req.SourceURL != "" {
			// Builder Mode: download tarball from R2
			if err := downloadAndExtract(req.DeploymentID, req.SourceURL); err != nil {
				setState(req.DeploymentID, "failed", fmt.Sprintf("source download failed: %v", err))
				return
			}
		} else {
			// Developer Mode: git clone
			hash, err := gitClone(req.DeploymentID, req.RepositoryURL, req.Branch, req.DeployToken)
			if err != nil {
				setState(req.DeploymentID, "failed", fmt.Sprintf("git clone failed: %v", err))
				return
			}
			commitHash = hash
		}

		// Step 2: Docker build via DinD sidecar
		imageTag := fmt.Sprintf("quikdb-%s:latest", req.DeploymentID)
		if err := dockerBuild(req.DeploymentID, imageTag); err != nil {
			setState(req.DeploymentID, "failed", fmt.Sprintf("docker build failed: %v", err))
			return
		}

		// Step 3: Start container with security hardening
		containerID, err := dockerRun(imageTag, port, req.EnvVars, req.Config)
		if err != nil {
			setState(req.DeploymentID, "failed", fmt.Sprintf("docker run failed: %v", err))
			return
		}

		mu.Lock()
		d := deployments[req.DeploymentID]
		d.Status = "live"
		d.CommitHash = commitHash
		d.ContainerID = containerID
		mu.Unlock()
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deploymentId": req.DeploymentID,
		"status":       "pending",
		"port":         port,
	})
}

// HandleStatus returns the current state of a deployment.
func HandleStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	mu.RLock()
	state, exists := deployments[id]
	mu.RUnlock()

	if !exists {
		http.Error(w, "deployment not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// HandleStop stops a running deployment container and cleans up.
func HandleStop(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	mu.RLock()
	state, exists := deployments[id]
	mu.RUnlock()

	if !exists {
		http.Error(w, "deployment not found", http.StatusNotFound)
		return
	}

	if state.ContainerID != "" {
		exec.Command("docker", "stop", state.ContainerID).Run()
		exec.Command("docker", "rm", state.ContainerID).Run()
	}

	setState(id, "stopped", "")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func allocatePort() (int, error) {
	for p := portMin; p <= portMax; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		if err == nil {
			ln.Close()
			return p, nil
		}
	}
	return 0, fmt.Errorf("no available ports in range %d-%d", portMin, portMax)
}

func setState(id, status, errMsg string) {
	mu.Lock()
	defer mu.Unlock()
	if d, ok := deployments[id]; ok {
		d.Status = status
		d.Error = errMsg
	}
}

// Stub implementations — full logic in private repo handles git, Docker, and R2 operations
func gitClone(id, repoURL, branch, token string) (string, error) { return "", nil }
func downloadAndExtract(id, sourceURL string) error              { return nil }
func dockerBuild(id, imageTag string) error                      { return nil }
func dockerRun(image string, port int, env map[string]string, cfg DeployConfig) (string, error) {
	return "", nil
}
