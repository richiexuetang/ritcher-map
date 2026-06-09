module Billing
  class CheckoutsController < ApplicationController
    include Authenticatable

    # POST /billing/checkout  -> { "checkout_url": "https://checkout.stripe.com/..." }
    def create
      session = StripeService.create_checkout_session(current_user)
      render json: { checkout_url: session.url }
    rescue StripeService::NotConfigured
      render json: { error: "billing not configured" }, status: :service_unavailable
    end
  end
end
