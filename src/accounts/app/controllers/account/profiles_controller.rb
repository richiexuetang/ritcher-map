module Account
  class ProfilesController < ApplicationController
    include Authenticatable

    # GET /account/me   (requires Authorization: Bearer <jwt>)
    def show
      render json: UserSerializer.call(current_user).merge(
        subscription: subscription_json
      )
    end

    private

    def subscription_json
      s = current_user.subscription
      return nil unless s
      { status: s.status, current_period_end: s.current_period_end }
    end
  end
end
