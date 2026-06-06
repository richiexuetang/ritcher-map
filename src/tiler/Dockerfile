# Production image for the tiling worker (Python, Kafka-driven).
# worker.py is the production entrypoint (the CLI uses package-relative imports
# that the current flat layout doesn't satisfy; the worker uses flat imports).
# Run it as a job — see docker-compose.prod.yml (profile "tiling"), not 24/7.
#   docker build -t tiling .
FROM python:3.11-slim-bookworm
WORKDIR /app
# Pillow/boto3/kafka-python ship manylinux wheels — no system build deps needed.
RUN pip install --no-cache-dir "Pillow>=10" "boto3>=1.34" "kafka-python>=2.0"
# .dockerignore excludes maps/*.png|*.jpg (~33 MB of sample art).
COPY . .
# Required env at runtime: TILES_BUCKET, KAFKA_BROKERS, and boto3 S3 creds
# (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL). See .env.example.
ENTRYPOINT ["python", "worker.py"]
