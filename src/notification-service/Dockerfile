# Dockerfile
FROM elixir:1.15-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    build-base

WORKDIR /app

# Install hex and rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Copy mix files
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
RUN mix deps.compile

# Copy source code
COPY . .

# Compile the release
RUN MIX_ENV=prod mix compile
RUN MIX_ENV=prod mix release

# Runtime image
FROM alpine:3.18

RUN apk add --no-cache \
    ncurses-libs \
    openssl

WORKDIR /app

# Copy release from builder stage
COPY --from=builder /app/_build/prod/rel/notification_service ./

# Create non-root user
RUN adduser -D notification_service
USER notification_service

EXPOSE 4000

CMD ["./bin/notification_service", "start"]
