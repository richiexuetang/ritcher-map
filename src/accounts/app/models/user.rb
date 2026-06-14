class User < ApplicationRecord
  has_secure_password

  before_validation :normalize_email

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  # has_secure_password validates presence of password on create; add a length floor.
  validates :password, length: { minimum: 8 }, allow_nil: true

  private

  def normalize_email
    self.email = email.to_s.downcase.strip if email.present?
  end
end
