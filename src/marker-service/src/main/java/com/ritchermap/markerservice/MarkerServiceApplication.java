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
