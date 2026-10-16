# CloudDeck developer entry points.
#
# Primarily for Linux, macOS and Git Bash on Windows (targets use sh syntax).
# On native Windows use scripts/dev.ps1 for local development — see README.md.

.PHONY: up down logs build agent agent-dry panel-dev typecheck test fmt clean

## Full stack (docker compose)

up: ## Build images and start panel + agent + nginx
	docker compose up -d --build

down: ## Stop the stack (named volumes are kept)
	docker compose down

logs: ## Follow container logs
	docker compose logs -f

build: ## Build docker images without starting containers
	docker compose build

## Local development

agent: ## Build the Go agent to agent/bin/clouddeck-agent
	cd agent && go build -o bin/clouddeck-agent ./cmd/clouddeck-agent

agent-dry: ## Run the agent in dry-run mode (no root, no system changes)
	cd agent && AGENT_DRY_RUN=true go run ./cmd/clouddeck-agent

panel-dev: ## Start the Next.js dev server (http://localhost:3000)
	cd panel && npm run dev

typecheck: ## Typecheck the panel (tsc --noEmit)
	cd panel && npm run typecheck

test: ## Run the agent test suite
	cd agent && go test ./...

fmt: ## Format agent Go sources
	cd agent && gofmt -w .

clean: ## Remove build artifacts
	rm -rf agent/bin panel/.next
