module Auth
  class RegistrationsController < ApplicationController
    # POST /auth/register  { "email": "...", "password": "..." }
    def create
      user = User.create!(email: params.require(:email), password: params.require(:password))
      render json: {
        token: JwtService.encode(user),
        user: UserSerializer.call(user)
      }, status: :created
    end
  end
end
