class Subscription < ApplicationRecord
  belongs_to :user

  # String-backed so DB values are human-readable and stable across deploys.
  enum :status, {
    free: "free",
    active: "active",
    past_due: "past_due",
    canceled: "canceled"
  }, default: "free"

  validates :status, presence: true
end
