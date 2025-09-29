# frozen_string_literal: true

class Localization < ApplicationRecord
  belongs_to :translatable, polymorphic: true, optional: true

  validates :locale, presence: true
  validates :key, presence: true
  validates :key, uniqueness: { scope: [ :locale, :translatable_type, :translatable_id ] }

  scope :for_locale, ->(locale) { where(locale: locale) }
  scope :global, -> { where(translatable_id: nil) }
end
