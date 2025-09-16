# Marker Service

## Project structure
```markdown
marker-service/
├── pom.xml
├── Dockerfile
├── src/
│   └── main/
│      ├── java/
│      │   └── com/
│      │       └── ritchermap/
│      │           └── markerservice/
│      │               ├── MarkerServiceApplication.java
│      │               ├── config/
│      │               │   ├── DatabaseConfig.java
│      │               │   ├── KafkaConfig.java
│      │               │   └── SecurityConfig.java
│      │               ├── controller/
│      │               │   ├── MarkerController.java
│      │               │   ├── CategoryController.java
│      │               │   └── HealthController.java
│      │               ├── dto/
│      │               │   ├── MarkerDto.java
│      │               │   ├── CreateMarkerRequest.java
│      │               │   ├── UpdateMarkerRequest.java
│      │               │   ├── MarkerBulkRequest.java
│      │               │   └── CategoryDto.java
│      │               ├── entity/
│      │               │   ├── Game.java
│      │               │   ├── Marker.java
│      │               │   ├── Category.java
│      │               │   └── MarkerHistory.java
│      │               ├── repository/
│      │               │   ├── GameRepository.java
│      │               │   ├── MarkerRepository.java
│      │               │   ├── CategoryRepository.java
│      │               │   └── MarkerHistoryRepository.java
│      │               ├── service/
│      │               │   ├── MarkerService.java
│      │               │   ├── CategoryService.java
│      │               │   ├── MarkerHistoryService.java
│      │               │   └── EventPublisher.java
│      │               ├── exception/
│      │               │   ├── GlobalExceptionHandler.java
│      │               │   ├── ResourceNotFoundException.java
│      │               │   ├── ValidationException.java
│      │               │   └── BusinessException.java
│      │               └── util/
│      │                   ├── GeometryUtils.java
│      │                   └── ValidationUtils.java
│      └── resources/
│          ├── application.yml
│          ├── application-dev.yml
│          ├── application-prod.yml
│          └── db/
│              └── migration/
│                  ├── V1__Create_games_table.sql
│                  ├── V2__Create_categories_table.sql
│                  ├── V3__Create_markers_table.sql
│                  └── V4__Create_marker_history_table.sql


```

### pom.xml

```markdown
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
	<modelVersion>4.0.0</modelVersion>
	<parent>
		<groupId>org.springframework.boot</groupId>
		<artifactId>spring-boot-starter-parent</artifactId>
		<version>3.5.5</version>
		<relativePath/> <!-- lookup parent from repository -->
	</parent>
	<groupId>com.ritchermap</groupId>
	<artifactId>marker-service</artifactId>
	<version>0.0.1-SNAPSHOT</version>
	<name>marker-service</name>
	<description>marker-service</description>
	<properties>
		<java.version>21</java.version>
		<spring-cloud.version>2023.0.0</spring-cloud.version>
		<testcontainers.version>1.19.3</testcontainers.version>
		<flyway.version>10.20.1</flyway.version>
	</properties>

	<dependencies>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-jpa</artifactId>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-web</artifactId>
		</dependency>

		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-devtools</artifactId>
			<scope>runtime</scope>
			<optional>true</optional>
		</dependency>
		<dependency>
			<groupId>org.projectlombok</groupId>
			<artifactId>lombok</artifactId>
			<optional>true</optional>
		</dependency>
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-test</artifactId>
			<scope>test</scope>
		</dependency>
        <dependency>
            <groupId>org.locationtech.jts</groupId>
            <artifactId>jts-core</artifactId>
            <version>1.19.0</version>
        </dependency>

		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-validation</artifactId>
		</dependency>

		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-actuator</artifactId>
		</dependency>

		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-security</artifactId>
		</dependency>

		<!-- Database -->
		<dependency>
			<groupId>org.postgresql</groupId>
			<artifactId>postgresql</artifactId>
			<scope>runtime</scope>
			<version>42.7.3</version>
		</dependency>

		<dependency>
			<groupId>org.flywaydb</groupId>
			<artifactId>flyway-core</artifactId>
			<version>${flyway.version}</version>
		</dependency>

		<!-- Add Flyway PostgreSQL plugin -->
		<dependency>
			<groupId>org.flywaydb</groupId>
			<artifactId>flyway-database-postgresql</artifactId>
			<version>10.15.0</version>
		</dependency>
		<dependency>
			<groupId>org.hibernate.orm</groupId>
			<artifactId>hibernate-spatial</artifactId>
			<version>7.1.1.Final</version>
		</dependency>
		<!-- Kafka -->
		<dependency>
			<groupId>org.springframework.kafka</groupId>
			<artifactId>spring-kafka</artifactId>
		</dependency>

		<!-- JSON Processing -->
		<dependency>
			<groupId>com.fasterxml.jackson.core</groupId>
			<artifactId>jackson-databind</artifactId>
		</dependency>

		<dependency>
			<groupId>com.fasterxml.jackson.datatype</groupId>
			<artifactId>jackson-datatype-jsr310</artifactId>
		</dependency>

		<!-- Utilities -->
		<dependency>
			<groupId>org.mapstruct</groupId>
			<artifactId>mapstruct</artifactId>
			<version>1.5.5.Final</version>
		</dependency>

		<dependency>
			<groupId>org.apache.commons</groupId>
			<artifactId>commons-lang3</artifactId>
		</dependency>

		<dependency>
			<groupId>org.springframework.security</groupId>
			<artifactId>spring-security-test</artifactId>
			<scope>test</scope>
		</dependency>

		<dependency>
			<groupId>org.springframework.kafka</groupId>
			<artifactId>spring-kafka-test</artifactId>
			<scope>test</scope>
		</dependency>

		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>junit-jupiter</artifactId>
			<scope>test</scope>
		</dependency>

		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>postgresql</artifactId>
			<scope>test</scope>
		</dependency>

		<dependency>
			<groupId>org.testcontainers</groupId>
			<artifactId>kafka</artifactId>
			<scope>test</scope>
		</dependency>
    </dependencies>

	<build>
		<plugins>
			<plugin>
				<groupId>org.apache.maven.plugins</groupId>
				<artifactId>maven-compiler-plugin</artifactId>
				<configuration>
					<annotationProcessorPaths>
						<path>
							<groupId>org.projectlombok</groupId>
							<artifactId>lombok</artifactId>
						</path>
					</annotationProcessorPaths>
				</configuration>
			</plugin>
			<plugin>
				<groupId>org.springframework.boot</groupId>
				<artifactId>spring-boot-maven-plugin</artifactId>
				<configuration>
					<excludes>
						<exclude>
							<groupId>org.projectlombok</groupId>
							<artifactId>lombok</artifactId>
						</exclude>
					</excludes>
				</configuration>
			</plugin>

			<plugin>
				<groupId>org.flywaydb</groupId>
				<artifactId>flyway-maven-plugin</artifactId>
				<version>10.0.0</version>
			</plugin>
		</plugins>
	</build>

</project>
```

### Dockerfile

```markdown
FROM openjdk:21-jdk

WORKDIR /app

# Copy Maven files
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .

# Download dependencies
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy source code
COPY src ./src

# Build application
RUN ./mvnw clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=0 /app/target/marker-service-*.jar app.jar

# Create non-root user
RUN useradd -r -s /bin/false markerservice
USER markerservice

EXPOSE 8004

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### MarkerServiceApplication.java

```markdown
package com.ritchermap.markerservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableJpaAuditing
@EnableKafka
@EntityScan("com.ritchermap.markerservice.entity")
@EnableJpaRepositories("com.ritchermap.markerservice.repository")
public class MarkerServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(MarkerServiceApplication.class, args);
	}

}
```

### controller/MarkerController.java

### controller/CategoryController.java
### dto/MarkerDto.java
### dto/CreateMarkerRequest.java
### dto/UpdateMarkerRequest.java
### dto/MarkerBulkRequest.java
### dto/CategoryDto.java

### entity/Game.java
### entity/Marker.java
### entity/Category.java
### entity/MarkerHistory.java

### repository/GameRepository.java
### repository/MarkerRepository.java
### repository/CategoryRepository.java
### repository/MarkerHistoryRepository.java

### service/MarkerHistoryService.java
### service/MarkerService.java
### service/CategoryService.java
### service/EventPublisher.java

### exception

### util
```markdown
package com.ritchermap.markerservice.util;


import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;

public class GeometryUtils {

    private static final GeometryFactory GEOMETRY_FACTORY =
            new GeometryFactory(new PrecisionModel(), 4326);

    public static Point createPoint(double longitude, double latitude) {
        return GEOMETRY_FACTORY.createPoint(new Coordinate(longitude, latitude));
    }

    public static double getLatitude(Point point) {
        return point.getY();
    }

    public static double getLongitude(Point point) {
        return point.getX();
    }

    public static double calculateDistance(Point point1, Point point2) {
        // Simple Haversine distance calculation
        double lat1 = Math.toRadians(point1.getY());
        double lat2 = Math.toRadians(point2.getY());
        double deltaLat = Math.toRadians(point2.getY() - point1.getY());
        double deltaLng = Math.toRadians(point2.getX() - point1.getX());

        double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return 6371000 * c; // Earth radius in meters
    }
}
```

### migration

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE games (
                       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                       name VARCHAR(255) NOT NULL,
                       slug VARCHAR(100) UNIQUE NOT NULL,
                       map_bounds GEOMETRY(POLYGON, 4326),
                       max_zoom_level INTEGER DEFAULT 18,
                       min_zoom_level INTEGER DEFAULT 0,
                       description TEXT,
                       is_active BOOLEAN DEFAULT true,
                       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_games_slug ON games(slug);
CREATE INDEX idx_games_active ON games(is_active);
CREATE INDEX idx_games_bounds ON games USING GIST(map_bounds);

CREATE TABLE categories (
                            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                            game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                            name VARCHAR(255) NOT NULL,
                            description TEXT,
                            icon_url VARCHAR(500),
                            display_color VARCHAR(7), -- Hex color code
                            sort_order INTEGER DEFAULT 0,
                            is_active BOOLEAN DEFAULT true,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

                            UNIQUE(game_id, name)
);

CREATE INDEX idx_categories_game ON categories(game_id);
CREATE INDEX idx_categories_active ON categories(game_id, is_active);
CREATE INDEX idx_categories_sort ON categories(game_id, sort_order);

CREATE TABLE markers (
                         id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                         game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
                         position GEOMETRY(POINT, 4326) NOT NULL,
                         title VARCHAR(255) NOT NULL,
                         description TEXT,
                         metadata JSONB DEFAULT '{}',
                         visibility_level INTEGER DEFAULT 1,
                         created_by UUID,
                         updated_by UUID,
                         version INTEGER DEFAULT 1,
                         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                         updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_markers_game ON markers(game_id);
CREATE INDEX idx_markers_category ON markers(category_id);
CREATE INDEX idx_markers_position ON markers USING GIST(position);
-- CREATE INDEX idx_markers_game_position ON markers USING GIST(game_id, position);
CREATE INDEX idx_markers_visibility ON markers(game_id, visibility_level);
CREATE INDEX idx_markers_created_by ON markers(created_by);
CREATE INDEX idx_markers_created_at ON markers(created_at);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_markers_updated_at BEFORE UPDATE ON markers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TYPE operation_type AS ENUM ('CREATE', 'UPDATE', 'DELETE');

CREATE TABLE marker_history (
                                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                marker_id UUID NOT NULL,
                                game_id UUID NOT NULL,
                                category_id UUID,
                                position GEOMETRY(POINT, 4326) NOT NULL,
                                title VARCHAR(255) NOT NULL,
                                description TEXT,
                                metadata JSONB DEFAULT '{}',
                                visibility_level INTEGER,
                                operation_type operation_type NOT NULL,
                                changed_by UUID,
                                version INTEGER,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for history queries
CREATE INDEX idx_marker_history_marker ON marker_history(marker_id);
CREATE INDEX idx_marker_history_game ON marker_history(game_id);
CREATE INDEX idx_marker_history_created_at ON marker_history(created_at);
CREATE INDEX idx_marker_history_changed_by ON marker_history(changed_by);
CREATE INDEX idx_marker_history_operation ON marker_history(operation_type);

```