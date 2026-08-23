# Interchouette MCP image targets (Hub + GHCR).
# Tags: :dev and :latest only (no semver tags).

MCP_NAME ?= interchouette-mcp
MCP_HUB_IMAGE ?= interchouette/interchouette-mcp
MCP_GHCR_PERSONAL_IMAGE ?= ghcr.io/groussac/interchouette-mcp
MCP_GHCR_WORKER_IMAGE ?= ghcr.io/interchouette/interchouette-mcp
MCP_GHCR_ORG_IMAGE ?= ghcr.io/interchouette-itc/interchouette-mcp
DOCKERFILE_MCP ?= docker/Dockerfile
DOCKER_BUILDKIT ?= 1

CLIPPY_FLAGS := -D warnings -D clippy::all -D clippy::pedantic -D clippy::nursery

.PHONY: help run run-www mcp-lint mcp-test mcp-build mcp-db mcp-news-snapshot \
	chat-lint chat-test chat-build \
	news-pg-up news-pg-down \
	mcp-docker-build mcp-docker-push-hub \
	mcp-docker-push-ghcr-personal mcp-docker-push-ghcr-itc \
	mcp-docker-push

help:
	@echo "Interchouette MCP"
	@echo "  make mcp-lint / mcp-test / mcp-build / mcp-db / mcp-news-snapshot"
	@echo "  make mcp-docker-build / mcp-docker-push"
	@echo "Chat"
	@echo "  make chat-lint / chat-test / chat-build"
	@echo "Local"
	@echo "  make run       chat API + WebSocket (http://127.0.0.1:8080)"
	@echo "  make run-www   Angular dev server (http://127.0.0.1:4200)"
	@echo "  make news-pg-up / news-pg-down   local Postgres for news archive"
	@echo "Tags: :dev :latest only"
	@echo "Images: $(MCP_HUB_IMAGE) | $(MCP_GHCR_ORG_IMAGE)"

mcp-lint:
	cd mcp && cargo fmt --check && cargo clippy --all-targets -- $(CLIPPY_FLAGS)

mcp-test:
	cd mcp && cargo test

mcp-build:
	cd mcp && cargo build --release

mcp-db:
	cd mcp && cargo run --bin interchouette-mcp-db -- ../db/interchouette.db

# Fetch one ISO week into mcp/catalog/news/YYYY-Www.json (archive API preferred, else live).
# Then run make mcp-db and commit the JSON + db.
mcp-news-snapshot:
	cd mcp && cargo run --bin interchouette-mcp-news-snapshot

chat-lint:
	cd backend && cargo fmt --check && cargo clippy --all-targets -- $(CLIPPY_FLAGS)

chat-test:
	cd backend && cargo test

chat-build:
	cd backend && cargo build --release

# Local Postgres for news archive (docker/docker-compose.news-pg.yml).
# After up, set DATABASE_URL in repo-root .env (see backend/README.md).
news-pg-up:
	docker compose -f docker/docker-compose.news-pg.yml up -d

news-pg-down:
	docker compose -f docker/docker-compose.news-pg.yml down

# Build then exec the binary (do not leave cargo run holding the target lock).
# Loads repo-root .env via backend/src/main.rs. Run www in another terminal: make run-www
run:
	@clear 2>/dev/null || true
	cd backend && cargo build && exec ./target/debug/interchouette-chat

run-www:
	cd www && NG_CLI_ANALYTICS=false npm start

mcp-docker-build:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull --network=host \
		-t $(MCP_NAME):dev \
		-t $(MCP_NAME):latest \
		-t $(MCP_HUB_IMAGE):dev \
		-t $(MCP_HUB_IMAGE):latest \
		-t $(MCP_GHCR_PERSONAL_IMAGE):dev \
		-t $(MCP_GHCR_PERSONAL_IMAGE):latest \
		-t $(MCP_GHCR_WORKER_IMAGE):dev \
		-t $(MCP_GHCR_WORKER_IMAGE):latest \
		-t $(MCP_GHCR_ORG_IMAGE):dev \
		-t $(MCP_GHCR_ORG_IMAGE):latest \
		-f $(DOCKERFILE_MCP) \
		.

mcp-docker-push-hub:
	docker push $(MCP_HUB_IMAGE):dev
	docker push $(MCP_HUB_IMAGE):latest

mcp-docker-push-ghcr-personal:
	docker push $(MCP_GHCR_PERSONAL_IMAGE):dev
	docker push $(MCP_GHCR_PERSONAL_IMAGE):latest

mcp-docker-push-ghcr-itc:
	docker push $(MCP_GHCR_WORKER_IMAGE):dev
	docker push $(MCP_GHCR_WORKER_IMAGE):latest
	docker push $(MCP_GHCR_ORG_IMAGE):dev
	docker push $(MCP_GHCR_ORG_IMAGE):latest

mcp-docker-push:
	@if [ "$(CI)" = "true" ] || [ "$(CI)" = "1" ]; then \
		echo "Use mcp-docker-push-hub / mcp-docker-push-ghcr-* in CI"; \
		exit 1; \
	fi
	@echo "Logging in to Docker Hub..."; \
	docker login || { echo "Docker Hub login failed"; exit 1; }
	$(MAKE) mcp-docker-push-hub
	@echo "Logging in to GHCR (personal)..."; \
	docker login ghcr.io || { echo "Skipping personal GHCR"; exit 0; }
	$(MAKE) mcp-docker-push-ghcr-personal
	@echo "Logging in to GHCR (org)..."; \
	docker login ghcr.io || { echo "Skipping org GHCR"; exit 0; }
	$(MAKE) mcp-docker-push-ghcr-itc
