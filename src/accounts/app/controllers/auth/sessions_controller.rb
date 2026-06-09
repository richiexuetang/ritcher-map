module Auth
  class SessionsController < ApplicationController
    # POST /auth/login  { "email": "...", "password": "..." }
    def create
      user = User.find_by(email: params[:email].to_s.downcase.strip)
      if user&.authenticate(params[:password])
        render json: {
          token: JwtService.encode(user),
          user: UserSerializer.call(user)
        }
      else
        render json: { error: "invalid email or password" }, status: :unauthorized
      end
    end
  end
end
