# frozen_string_literal: true

class MapTileGeneratorJob < ApplicationJob
  queue_as :default

  def perform(map)
    map.update!(processing_status: "processing")

    begin
      # Call to the Map Tile Service (Rust) via gRPC or HTTP
      response = MapTileServiceClient.generate_tiles(
        map_id: map.id,
        game_id: map.game_id,
        source_url: map.source_image.url,
        min_zoom: map.min_zoom,
        max_zoom: map.max_zoom
      )

      map.update!(
        processing_status: "completed",
        tile_settings: response[:tile_settings],
        width: response[:width],
        height: response[:height]
      )

      # Notify other services via Kafka
      KafkaProducer.send_event("map.tiles.generated", {
        map_id: map.id,
        game_id: map.game_id,
        tile_count: response[:tile_count]
      })

    rescue StandardError => e
      map.update!(processing_status: "failed")
      Rails.logger.error "Tile generation failed for map #{map.id}: #{e.message}"
      raise
    end
  end
end
