# frozen_string_literal: true

class KafkaProducer
  def self.send_event(topic, payload)
    # Simplified Kafka producer - in production use ruby-kafka gem
    Rails.logger.info "Publishing to Kafka: #{topic} - #{payload.to_json}"

    # Example with ruby-kafka:
    # kafka = Kafka.new(ENV['KAFKA_BROKERS'].split(','))
    # kafka.deliver_message(payload.to_json, topic: topic)
  end
end
