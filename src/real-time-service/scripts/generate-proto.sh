#!/bin/bash
set -e

# Generate Protocol Buffer files
protoc --go_out=. --go_opt=paths=source_relative \
    internal/proto/events.proto

echo "Protocol Buffer files generated successfully"