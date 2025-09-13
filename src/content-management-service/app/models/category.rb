# frozen_string_literal: true

class Category < ApplicationRecord
  include Cacheable

  # Associations
  belongs_to :game
  belongs_to :parent, class_name: 'Category', optional: true
  has_many :subcategories, class_name: 'Category', foreign_key: :parent_id, dependent: :destroy
  has_many :locale_contents, as: :translatable, dependent: :destroy

  # Validations
  validates :name, :slug, presence: true
  validates :slug, uniqueness: { scope: :game_id }
  validates :color, format: { with: /\A#[0-9A-F]{6}\z/i }, allow_blank: true
  validate :prevent_circular_reference

  # Scopes
  scope :active, -> { where(is_active: true) }
  scope :root, -> { where(parent_id: nil) }
  scope :collectibles, -> { where(is_collectible: true) }
  scope :ordered, -> { order(:display_order, :name) }

  # Callbacks
  after_save :update_descendants_cache

  def full_path
    ancestors.push(self).map(&:name).join(' > ')
  end

  def ancestors
    return [] if parent.nil?
    parent.ancestors + [parent]
  end

  def descendants
    subcategories.flat_map { |c| [c] + c.descendants }
  end

  def depth
    ancestors.count
  end

  def translated_name(locale = I18n.locale)
    locale_contents.find_by(locale: locale, field_name: 'name')&.content || name
  end

  private

  def prevent_circular_reference
    return unless parent_id.present?

    if parent_id == id
      errors.add(:parent_id, 'cannot be self')
    elsif descendants.map(&:id).include?(parent_id)
      errors.add(:parent_id, 'would create circular reference')
    end
  end

  def update_descendants_cache
    CacheInvalidationService.new(self).invalidate_category_tree
  end
end
