class User < ApplicationRecord
  has_secure_password
  has_one :subscription, dependent: :destroy

  before_validation :normalize_email

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  # has_secure_password validates presence of password on create; add a length floor.
  validates :password, length: { minimum: 8 }, allow_nil: true

  # Every user gets a (free) subscription row so billing has something to update.
  after_create :ensure_subscription

  # Premium = an active subscription that hasn't lapsed. This is the single
  # source of truth other endpoints (and eventually the read path) gate on.
  def premium?
    s = subscription
    return false unless s
    s.status == "active" && (s.current_period_end.nil? || s.current_period_end.future?)
  end

  private

  def normalize_email
    self.email = email.to_s.downcase.strip if email.present?
  end

  def ensure_subscription
    create_subscription!(status: "free") unless subscription
  end
end
