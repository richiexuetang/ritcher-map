# frozen_string_literal: true

class Game < ApplicationRecord
  has_many :categories, dependent: :destroy
  has_many :tags, dependent: :destroy
  has_many :maps, dependent: :destroy
  has_many :localizations, dependent: :destroy, as: :translatable

  has_one_attached :cover_image
  has_one_attached :thumbnail

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true

  before_validation :generate_slug

  def localized_name(locale = I18n.locale)
    localizations.find_by(locale: locale, key: "name").value || name
  end

  private

  def generate_slug
    self.slug = name.parameterize if name.present? && slug.blank?
  end
end
