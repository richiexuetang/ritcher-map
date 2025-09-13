class MapProcessorService
  attr_reader :map, :errors

  TILE_SIZE = 256
  SUPPORTED_FORMATS = %w[jpg jpeg png webp].freeze

  def initialize(map)
    @map = map
    @errors = []
  end

  def process
    return false unless validate_map

    map.start_processing!

    begin
      download_original
      process_image
      generate_tiles
      upload_tiles
      cleanup_temp_files

      map.complete_processing!
      true
    rescue StandardError => e
      @errors << e.message
      map.fail_processing!(e.message)
      Rails.logger.error "Map processing failed: #{e.message}"
      Sentry.capture_exception(e)
      false
    end
  end

  private

  def validate_map
    unless map.original_file.attached?
      @errors << 'No file attached'
      return false
    end

    unless SUPPORTED_FORMATS.include?(map.original_file.blob.content_type.split('/').last)
      @errors << 'Unsupported file format'
      return false
    end

    true
  end

  def download_original
    @temp_file = Tempfile.new(['map', File.extname(map.original_file.filename.to_s)])
    @temp_file.binmode
    @temp_file.write(map.original_file.download)
    @temp_file.rewind
  end

  def process_image
    image = MiniMagick::Image.open(@temp_file.path)

    # Store dimensions
    map.update!(
      width: image.width,
      height: image.height
    )

    # Optimize image
    image.strip
    image.quality(85)
    image.format('jpg')

    @processed_path = @temp_file.path.gsub(/\.[^.]+$/, '_processed.jpg')
    image.write(@processed_path)
  end

  def generate_tiles
    @tiles = []

    (map.min_zoom..map.max_zoom).each do |zoom|
      generate_tiles_for_zoom(zoom)
    end
  end

  def generate_tiles_for_zoom(zoom)
    scale = 2 ** zoom
    scaled_width = map.width * scale / (2 ** map.max_zoom)
    scaled_height = map.height * scale / (2 ** map.max_zoom)

    tiles_x = (scaled_width / TILE_SIZE.to_f).ceil
    tiles_y = (scaled_height / TILE_SIZE.to_f).ceil

    image = MiniMagick::Image.open(@processed_path)
    image.resize("#{scaled_width}x#{scaled_height}")

    tiles_x.times do |x|
      tiles_y.times do |y|
        tile_path = generate_tile(image, zoom, x, y)
        @tiles << {
          path: tile_path,
          zoom: zoom,
          x: x,
          y: y
        }
      end
    end
  end

  def generate_tile(image, zoom, x, y)
    tile_path = Rails.root.join('tmp', "tile_#{zoom}_#{x}_#{y}.jpg")

    image.crop("#{TILE_SIZE}x#{TILE_SIZE}+#{x * TILE_SIZE}+#{y * TILE_SIZE}")
    image.write(tile_path)

    tile_path
  end

  def upload_tiles
    s3_client = Aws::S3::Client.new
    bucket = Rails.application.config.s3_bucket

    @tiles.each do |tile|
      key = "tiles/#{map.game.slug}/#{map.slug}/#{tile[:zoom]}/#{tile[:x]}/#{tile[:y]}.jpg"

      File.open(tile[:path], 'rb') do |file|
        s3_client.put_object(
          bucket: bucket,
          key: key,
          body: file,
          content_type: 'image/jpeg',
          cache_control: 'public, max-age=31536000'
        )
      end
    end

    # Update map with CDN URL
    cdn_base = Rails.application.config.cdn_url
    map.update!(
      processed_file_url: "#{cdn_base}/tiles/#{map.game.slug}/#{map.slug}/"
    )
  end

  def cleanup_temp_files
    @temp_file&.close
    @temp_file&.unlink
    File.delete(@processed_path) if @processed_path && File.exist?(@processed_path)

    @tiles&.each do |tile|
      File.delete(tile[:path]) if File.exist?(tile[:path])
    end
  end
end