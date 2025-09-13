# frozen_string_literal: true

class Map < ApplicationRecord
  include Versionable
  include Cacheable

  belongs_to :game
  has_many :locale_contents, as: :translatable, dependent: :destroy

  # Active Storage
  has_one_attached :original_file
  has_one_attached :processed_file
  has_many_attached :tiles

  # Validations
  validates :name, :slug, presence: true
  validates :slug, uniqueness: { scope: :game_id }
  validates :min_zoom, :max_zoom, numericality: { greater_than_or_equal_to: 0 }
  validate :validate_zoom_range

  # Scopes
  scope :processed, -> { where(processing_status: 'completed') }
  scope :pending, -> { where(processing_status: 'pending') }
  scope :failed, -> { where(processing_status: 'failed') }

  # Callbacks
  after_create :enqueue_processing
  before_destroy :cleanup_tiles

  # State Machine for Processing
  include AASM

  aasm column: :processing_status do
    state :pending, initial: true
    state :processing
    state :completed
    state :failed

    event :start_processing do
      transitions from: :pending, to: :processing
    end

    event :complete_processing do
      transitions from: :processing, to: :completed
      after do
        self.processed_at = Time.current
        save!
        notify_completion
      end
    end

    event :fail_processing do
      transitions from: :processing, to: :failed
      after do |error|
        self.processing_errors = error
        save!
        notify_failure
      end
    end

    event :retry_processing do
      transitions from: :failed, to: :pending
      after do
        self.processing_errors = nil
        save!
        enqueue_processing
      end
    end
  end

  def tile_url(zoom, x, y, format = 'png')
    return nil unless processed?

    base_url = Rails.application.config.cdn_url
    "#{base_url}/tiles/#{game.slug}/#{slug}/#{zoom}/#{x}/#{y}.#{format}"
  end

  def processed?
    processing_status == 'completed'
  end

  private

  def validate_zoom_range
    errors.add(:max_zoom, 'must be greater than min_zoom') if max_zoom < min_zoom
  end

  def enqueue_processing
    MapProcessingJob.perform_later(self)
  end

  def cleanup_tiles
    # Clean up S3/storage tiles
    CacheInvalidationService.new(self).invalidate_map_tiles
  end

  def notify_completion
    EventPublisher.publish('map.processed', { map_id: id, game_id: game_id })
  end

  def notify_failure
    EventPublisher.publish('map.processing_failed', { map_id: id, error: processing_errors })
  end
end

