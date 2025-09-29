# frozen_string_literal: true

class MapTileServiceClient
  BASE_URL = ENV.fetch("MAP_TILE_SERVICE_URL", "http://map-tile-service:8001")

  def self.generate_tiles(params)
    response = HTTParty.post(
      "#{BASE_URL}/tiles/generate",
      body: params.to_json,
      headers: { "Content-Type" => "application/json" },
      timeout: 300 # 5 minutes for large maps
    )

    if response.success?
      response.parsed_response.symbolize_keys
    else
      raise "Tile generation failed: #{response.code} - #{response.body}"
    end
  end
end
