# interchouette-mcp - Streamable HTTP on :8080 at /interchouette
# Build context: repo root (needs db/interchouette.db + mcp/)

ARG RUST_IMAGE=rust:1.97-bookworm
ARG RUNTIME_IMAGE=debian:bookworm-slim

FROM ${RUST_IMAGE} AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates pkg-config binutils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY mcp/Cargo.toml mcp/Cargo.lock ./
COPY mcp/src ./src
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
COPY db/interchouette.db /app/db/interchouette.db

RUN chown -R mcp:mcp /app

USER mcp
ENV KNOWLEDGE_DB=/app/db/interchouette.db \
    MCP_LISTEN=0.0.0.0:8080 \
    CORS_ORIGIN=https://interchouette.net \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8080
CMD ["interchouette-mcp", "--listen", "0.0.0.0:8080"]
