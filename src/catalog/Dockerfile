# Production image for catalog (Java / Spring Boot 4 write path + schema owner).
# Multi-stage: build the executable boot jar with the JDK, run it on a slim JRE.
# Flyway runs V1 on startup against the configured (empty) database.
#   docker build -t catalog .
FROM eclipse-temurin:17-jdk-noble AS build
WORKDIR /app
# Warm the Gradle dependency cache from the build scripts before copying sources.
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x ./gradlew && ./gradlew --no-daemon dependencies >/dev/null 2>&1 || true
# .dockerignore excludes build/ and .gradle/.
COPY src ./src
# Shared protobuf contract (single source of truth) supplied as a named build
# context; generateProto reads it from /proto (= /app/../../proto). protoc is
# resolved from Maven by Gradle, so no system protoc is needed in the image.
COPY --from=proto . /proto
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
