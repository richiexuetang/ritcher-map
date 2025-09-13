package com.ritchermap.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI markerServiceOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Marker Service API")
                        .description("MapGenie Clone - Marker Management Service")
                        .version("1.0.0")
                        .license(new License().name("MIT").url("https://opensource.org/licenses/MIT"))
                );
    }
}