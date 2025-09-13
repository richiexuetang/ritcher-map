# frozen_string_literal: true

class Game < ApplicationRecord
  include Versionable
  include Cachable

  # Associations
  has_many :maps, dependent: :destroy
  has_many :categories, dependent: :destroy
  has_many :game_tags, dependent: :destroy
  has_many :tags, through: :game_tags
  has_many :locale_contents, as: :translatable, dependent: :destroy

  # Validations
  validates :title, :slug, presence: true
  validates :slug, uniqueness: true, format: { with: /\A[a-z0-9\-]+\z/ }
  validates :status, inclusion: { in: %w[draft published archived] }

  # Scopes
  scope :published, -> { where(status: 'published') }
  scope :featured, -> { where(featured: true) }
  scope :by_platform, ->(platform) { where('? = ANY(platform)', platform) }

  # Callbacks
  before_validation :generate_slug
  after_update :invalidate_cache

  # State Machine
  include AASM

  aasm column: :status do
    state :draft, initial: true
    state :published
    state :archived

    event :publish do
      transitions from: :draft, to: :published
      after do
        notify_publish
        warm_cache
      end
    end

    event :archive do
      transitions from: [:draft, :published], to: :archived
    end

    event :unarchive do
      transitions from: :archived, to: :draft
    end
  end

  # Methods
  def default_map
    maps.find_by(is_default: true) || maps.first
  end

  def translated_title(locale = I18n.locale)
    locale_contents.find_by(locale: locale, field_name: 'title')&.content || title
  end

  def to_param
    slug
  end

  private

  def generate_slug
    self.slug = title.parameterize if title.present? && slug.blank?
  end

  def notify_publish
    EventPublisher.publish('game.published', { game_id: id })
  end

  def warm_cache
    CacheWarmingJob.perform_later(self)
  end
end