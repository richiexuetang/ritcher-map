module Account
  class ProfilesController < ApplicationController
    include Authenticatable

    # GET /account/me   (requires Authorization: Bearer <jwt>)
    def show
      render json: UserSerializer.call(current_user)
    end
  end
end
