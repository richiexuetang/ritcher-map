# frozen_string_literal: true

class Category < ApplicationRecord
  belongs_to :game
  belongs_to :parent, class_name: "Category", optional: true
  has_many :subcategories, class_name: "Category", foreign_key: "parent_id", dependent: :destroy
  has_many :localizations, as: :translatable, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true
  validates :slug, uniqueness: { scope: :game_id }

  before_validation :generate_slug

  scope :root_categories, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:display_order, :name) }

  def full_path
    ancestors = []
    current = self
    while current
      ancestors.unshift(current.slug)
      current = current.parent
    end
    ancestors.join("/")
  end

  private

  def generate_slug
    self.slug = name.parameterize if name.present? && slug.blank?
  end
end
