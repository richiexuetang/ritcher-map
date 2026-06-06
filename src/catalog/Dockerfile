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
# bootJar only (no tests — those run in CI). Copy the executable jar, not -plain.
RUN ./gradlew --no-daemon clean bootJar && \
    cp "$(ls build/libs/*.jar | grep -v -- '-plain\.jar')" /app/app.jar

FROM eclipse-temurin:17-jre-noble
WORKDIR /app
# Capped, container-aware JVM defaults — override JAVA_TOOL_OPTIONS in compose.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k"
COPY --from=build /app/app.jar ./app.jar
RUN useradd -r -u 1000 spring && chown spring:spring /app/app.jar
USER 1000
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
