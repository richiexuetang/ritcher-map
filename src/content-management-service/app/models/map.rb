# frozen_string_literal: true

class Map < ApplicationRecord
  belongs_to :game

  has_one_attached :source_image

  validates :name, presence: true

  after_create_commit :enqueue_tile_generation

  private

  def enqueue_tile_generation
    MapTileGeneratorJob.perform_later(self)
  end
end
