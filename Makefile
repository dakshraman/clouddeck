# CloudDeck developer entry points.
#
# Primarily for Linux, macOS and Git Bash on Windows (targets use sh syntax).
# On native Windows use scripts/dev.ps1 for local development — see README.md.

.PHONY: agent agent-dry panel-dev site-dev site-build typecheck test test-installer fmt clean

## Local development

agent: ## Build the Go agent to agent/bin/clouddeck-agent
	cd agent && go build -o bin/clouddeck-agent ./cmd/clouddeck-agent

agent-dry: ## Run the agent in dry-run mode (no root, no system changes)
	cd agent && AGENT_DRY_RUN=true go run ./cmd/clouddeck-agent

panel-dev: ## Start the Next.js panel dev server (http://localhost:2083)
	cd panel && npm run dev

site-dev: ## Start the Next.js marketing site dev server (http://localhost:3000)
	cd site && npm run dev

site-build: ## Build the Next.js marketing site
	cd site && npm run build

typecheck: ## Typecheck the panel (tsc --noEmit)
	cd panel && npm run typecheck

test: ## Run the agent test suite
	cd agent && go test ./...

test-installer: ## Test installer validation and safe lifecycle paths
	bash scripts/install-test.sh

fmt: ## Format agent Go sources
	cd agent && gofmt -w .

clean: ## Remove build artifacts
	rm -rf agent/bin panel/.next
