# Interchouette knowledge MCP image targets (Hub + GHCR).

MCP_NAME ?= interchouette-mcp
MCP_HUB_IMAGE ?= interchouette/interchouette-mcp
MCP_GHCR_PERSONAL_IMAGE ?= ghcr.io/groussac/interchouette-mcp
MCP_GHCR_WORKER_IMAGE ?= ghcr.io/interchouette/interchouette-mcp
MCP_GHCR_ORG_IMAGE ?= ghcr.io/interchouette-itc/interchouette-mcp
MCP_VERSION ?= $(shell awk '/^version = /{gsub(/"/, "", $$3); print $$3; exit}' backend/Cargo.toml)
DOCKERFILE_MCP ?= docker/Dockerfile
DOCKER_BUILDKIT ?= 1
TAG ?= latest

CLIPPY_FLAGS := -D warnings -D clippy::all -D clippy::pedantic -D clippy::nursery

.PHONY: help mcp-lint mcp-test mcp-build \
	mcp-docker-build mcp-docker-build-dev \
	mcp-docker-push-dev mcp-docker-push-dev-hub \
	mcp-docker-push-dev-ghcr-personal mcp-docker-push-dev-ghcr-itc \
	mcp-docker-push-release mcp-docker-push-release-hub \
	mcp-docker-push-release-ghcr-personal mcp-docker-push-release-ghcr-itc

help:
	@echo "Knowledge MCP ($(MCP_VERSION))"
	@echo "  make mcp-lint / mcp-test / mcp-build"
	@echo "  make mcp-docker-build / mcp-docker-build-dev"
	@echo "  make mcp-docker-push-dev / mcp-docker-push-release"
	@echo "Images: $(MCP_HUB_IMAGE) | $(MCP_GHCR_ORG_IMAGE)"

mcp-lint:
	cd backend && cargo fmt --check && cargo clippy --all-targets -- $(CLIPPY_FLAGS)

mcp-test:
	cd backend && cargo test

mcp-build:
	cd backend && cargo build --release

mcp-docker-build:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull --network=host \
		-t $(MCP_NAME):$(TAG) \
		-t $(MCP_HUB_IMAGE):$(TAG) \
		-t $(MCP_HUB_IMAGE):$(MCP_VERSION) \
		-f $(DOCKERFILE_MCP) \
		.

mcp-docker-build-dev:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull --network=host \
		-t $(MCP_NAME):dev \
		-t $(MCP_HUB_IMAGE):dev \
		-t $(MCP_GHCR_PERSONAL_IMAGE):dev \
		-t $(MCP_GHCR_WORKER_IMAGE):dev \
		-t $(MCP_GHCR_ORG_IMAGE):dev \
		-f $(DOCKERFILE_MCP) \
		.

mcp-docker-push-dev-hub:
	docker push $(MCP_HUB_IMAGE):dev

mcp-docker-push-dev-ghcr-personal:
	docker push $(MCP_GHCR_PERSONAL_IMAGE):dev

mcp-docker-push-dev-ghcr-itc:
	docker push $(MCP_GHCR_WORKER_IMAGE):dev
	docker push $(MCP_GHCR_ORG_IMAGE):dev

mcp-docker-push-dev:
	@if [ "$(CI)" = "true" ] || [ "$(CI)" = "1" ]; then \
		echo "Use mcp-docker-push-dev-hub / mcp-docker-push-dev-ghcr-* in CI"; \
		exit 1; \
	fi
	@echo "Logging in to Docker Hub..."; \
	docker login || { echo "Docker Hub login failed"; exit 1; }
	$(MAKE) mcp-docker-push-dev-hub
	@echo "Logging in to GHCR (personal)..."; \
	docker login ghcr.io || { echo "Skipping personal GHCR"; exit 0; }
	$(MAKE) mcp-docker-push-dev-ghcr-personal
	@echo "Logging in to GHCR (org)..."; \
	docker login ghcr.io || { echo "Skipping org GHCR"; exit 0; }
	$(MAKE) mcp-docker-push-dev-ghcr-itc

mcp-docker-push-release-hub:
	docker push $(MCP_HUB_IMAGE):$(MCP_VERSION)
	docker push $(MCP_HUB_IMAGE):latest

mcp-docker-push-release-ghcr-personal:
	docker tag $(MCP_HUB_IMAGE):$(MCP_VERSION) $(MCP_GHCR_PERSONAL_IMAGE):$(MCP_VERSION)
	docker tag $(MCP_HUB_IMAGE):latest $(MCP_GHCR_PERSONAL_IMAGE):latest
	docker push $(MCP_GHCR_PERSONAL_IMAGE):$(MCP_VERSION)
	docker push $(MCP_GHCR_PERSONAL_IMAGE):latest

mcp-docker-push-release-ghcr-itc:
	docker tag $(MCP_HUB_IMAGE):$(MCP_VERSION) $(MCP_GHCR_WORKER_IMAGE):$(MCP_VERSION)
	docker tag $(MCP_HUB_IMAGE):latest $(MCP_GHCR_WORKER_IMAGE):latest
	docker tag $(MCP_HUB_IMAGE):$(MCP_VERSION) $(MCP_GHCR_ORG_IMAGE):$(MCP_VERSION)
	docker tag $(MCP_HUB_IMAGE):latest $(MCP_GHCR_ORG_IMAGE):latest
	docker push $(MCP_GHCR_WORKER_IMAGE):$(MCP_VERSION)
	docker push $(MCP_GHCR_WORKER_IMAGE):latest
	docker push $(MCP_GHCR_ORG_IMAGE):$(MCP_VERSION)
	docker push $(MCP_GHCR_ORG_IMAGE):latest

mcp-docker-push-release: mcp-docker-push-release-hub \
	mcp-docker-push-release-ghcr-personal mcp-docker-push-release-ghcr-itc
