module Billing
  # Stripe calls this server-to-server, so it is NOT behind JWT auth. Trust is
  # established by verifying the Stripe-Signature header instead.
  class WebhooksController < ApplicationController
    # POST /billing/webhook
    def create
      event = StripeService.construct_event(
        request.body.read,
        request.headers["Stripe-Signature"]
      )
      StripeService.handle_event(event)
      head :ok
    rescue StripeService::NotConfigured
      head :service_unavailable
    rescue JSON::ParserError, Stripe::SignatureVerificationError
      head :bad_request
    end
  end
end
