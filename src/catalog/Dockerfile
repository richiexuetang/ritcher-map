# Production image for catalog (Java / Spring Boot 4 write path + schema owner).
# Multi-stage: build the executable boot jar with the JDK, run it on a slim JRE.
# Flyway runs V1 on startup against the configured (empty) database.
#
# Build context is the REPO ROOT (not src/catalog): the catalog build needs both
# src/catalog/** and the shared proto/** contract, which lives outside this dir.
# Single-context builders (e.g. Koyeb) can't supply proto/ as a named build
# context, so we COPY both by path from the root context instead.
#   docker build -f src/catalog/Dockerfile -t catalog .   # run from repo root
FROM eclipse-temurin:17-jdk-noble AS build
WORKDIR /app
# Warm the Gradle dependency cache from the build scripts before copying sources.
COPY src/catalog/gradlew src/catalog/settings.gradle src/catalog/build.gradle ./
COPY src/catalog/gradle ./gradle
RUN chmod +x ./gradlew && ./gradlew --no-daemon dependencies >/dev/null 2>&1 || true
# Root .dockerignore excludes build/ and .gradle/.
COPY src/catalog/src ./src
# Shared protobuf contract (single source of truth). generateProto reads it from
# /proto via -PprotoDir below; protoc is resolved from Maven by Gradle, so no
# system protoc is needed in the image.
COPY proto /proto
# bootJar only (no tests — those run in CI). Copy the executable jar, not -plain.
# -PprotoDir points the generateProto task at the contract copied above.
RUN ./gradlew --no-daemon -PprotoDir=/proto clean bootJar && \
    cp "$(ls build/libs/*.jar | grep -v -- '-plain\.jar')" /app/app.jar

FROM eclipse-temurin:17-jre-noble
WORKDIR /app
# Capped, container-aware JVM defaults — override JAVA_TOOL_OPTIONS in compose.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k"
COPY --from=build /app/app.jar ./app.jar
# uid 1001: the noble base image already ships an `ubuntu` user at uid 1000.
RUN useradd -r -u 1001 spring && chown spring:spring /app/app.jar
USER 1001
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
