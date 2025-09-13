package com.ritchermap.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@Configuration
@EnableJpaRepositories(basePackages = "com.ritchermap.repository")
@EnableJpaAuditing
@EnableTransactionManagement
public class DatabaseConfig {
    // JPA and transaction configuration
}

