# frozen_string_literal: true

class Tag < ApplicationRecord
  belongs_to :game, optional: true
  has_many :taggables, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  before_validation :generate_slug

  scope :global, -> { where(game_id: nil) }
  scope :for_game, ->(game_id) { where(game_id: [nil, game_id]) }

  private

  def generate_slug
    self.slug = name.parameterize if name.present? && slug.blank?
  end
end

