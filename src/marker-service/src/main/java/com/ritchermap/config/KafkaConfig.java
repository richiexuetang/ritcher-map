package com.ritchermap.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
@EnableKafka
public class KafkaConfig {

    @Bean
    public NewTopic markerEventsTopic() {
        return TopicBuilder.name("marker-events")
                .partitions(3)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic bulkOperationsTopic() {
        return TopicBuilder.name("bulk-operations")
                .partitions(2)
                .replicas(1)
                .build();
    }
}