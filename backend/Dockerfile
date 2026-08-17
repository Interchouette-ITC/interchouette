# interchouette-chat - WebSocket chat on :8080
# Build context: repo root (needs backend/)

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
  && strip -s target/release/interchouette-chat \
  && cp target/release/interchouette-chat /interchouette-chat

FROM ${RUNTIME_IMAGE} AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin chat

WORKDIR /app
COPY --from=builder /interchouette-chat /usr/local/bin/interchouette-chat

USER chat
# Do not set CHAT_LISTEN here: Render injects PORT; the binary binds 0.0.0.0:$PORT when CHAT_LISTEN is unset.
ENV CORS_ORIGIN=https://interchouette.net \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8080
CMD ["interchouette-chat"]
