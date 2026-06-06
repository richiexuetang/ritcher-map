# Production image for the gateway (Go edge: auth, routing, WebSocket fan-out).
# Static binary (CGO disabled) on distroless/static → ~15 MB, non-root.
#   docker build -t gateway .
FROM golang:1.24.7-bookworm AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /gateway /usr/local/bin/gateway
ENV BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
# JWT_SECRET is required at runtime (the process exits without it).
ENTRYPOINT ["/usr/local/bin/gateway"]
