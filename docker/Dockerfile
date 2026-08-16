# interchouette-mcp — Streamable HTTP on :8080 at /interchouette
# Build context: repo root (needs knowledge/ + backend/)

ARG RUST_IMAGE=rust:1.97-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim

FROM ${RUST_IMAGE} AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates pkg-config binutils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
RUN cargo build --release \
  && strip -s target/release/interchouette-mcp \
  && cp target/release/interchouette-mcp /interchouette-mcp

FROM ${RUNTIME_IMAGE} AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin mcp

WORKDIR /app
COPY --from=builder /interchouette-mcp /usr/local/bin/interchouette-mcp
COPY knowledge /app/knowledge

RUN mkdir -p /app/data && chown -R mcp:mcp /app

USER mcp
ENV DATA_DIR=/app/data \
    KNOWLEDGE_DIR=/app/knowledge \
    MCP_LISTEN=0.0.0.0:8080 \
    CORS_ORIGIN=https://interchouette.net \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8080
CMD ["interchouette-mcp", "--listen", "0.0.0.0:8080"]
