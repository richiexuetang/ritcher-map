# Mixed into controllers that require an authenticated user.
#
# Validates the Bearer JWT directly (same secret/contract as the gateway), so
# the service authenticates correctly whether it's hit through the gateway or
# directly (tests, internal calls). The gateway also forwards a trusted
# X-User-Id, but we don't depend on it here — validating the token keeps this
# service self-contained.
module Authenticatable
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_user!
  end

  private

  def authenticate_user!
    payload = JwtService.decode(bearer_token)
    @current_user = User.find_by(id: payload["sub"]) if payload
    render json: { error: "unauthorized" }, status: :unauthorized unless @current_user
  end

  def current_user
    @current_user
  end

  def bearer_token
    header = request.headers["Authorization"].to_s
    header.start_with?("Bearer ") ? header.split(" ", 2).last : nil
  end
end
