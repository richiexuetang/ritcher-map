# Wraps Stripe so controllers stay thin and the app boots without billing
# configured (the Stripe calls only run when an endpoint is actually hit).
class StripeService
  class NotConfigured < StandardError; end

  class << self
    # Create a Checkout Session for the premium plan and return it (caller uses .url).
    def create_checkout_session(user)
      ensure_configured!
      Stripe::Checkout::Session.create(
        customer: ensure_customer(user),
        mode: "subscription",
        line_items: [{ price: ENV.fetch("STRIPE_PRICE_ID"), quantity: 1 }],
        success_url: "#{frontend_url}/billing/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "#{frontend_url}/billing/cancel"
      )
    end

    # Verify + parse a webhook payload. Raises Stripe::SignatureVerificationError
    # on a bad signature (controller maps that to 400).
    def construct_event(payload, signature)
      ensure_configured!
      Stripe::Webhook.construct_event(payload, signature, ENV.fetch("STRIPE_WEBHOOK_SECRET"))
    end

    def handle_event(event)
      case event.type
      when "checkout.session.completed"
        on_checkout_completed(event.data.object)
      when "customer.subscription.updated", "customer.subscription.deleted"
        on_subscription_changed(event.data.object)
      end
    end

    private

    def ensure_configured!
      raise NotConfigured if ENV["STRIPE_SECRET_KEY"].blank?
    end

    # Reuse the Stripe customer if we've created one, else create + persist it.
    def ensure_customer(user)
      sub = user.subscription
      return sub.stripe_customer_id if sub.stripe_customer_id.present?

      customer = Stripe::Customer.create(email: user.email, metadata: { user_id: user.id })
      sub.update!(stripe_customer_id: customer.id)
      customer.id
    end

    def on_checkout_completed(session)
      sub = Subscription.find_by(stripe_customer_id: session.customer)
      sub&.update!(status: "active", stripe_subscription_id: session.subscription)
    end

    def on_subscription_changed(stripe_sub)
      sub = Subscription.find_by(stripe_customer_id: stripe_sub.customer)
      return unless sub

      status =
        case stripe_sub.status
        when "active", "trialing" then "active"
        when "past_due", "unpaid" then "past_due"
        else "canceled"
        end

      sub.update!(
        status: status,
        current_period_end: Time.at(stripe_sub.current_period_end)
      )
    end

    def frontend_url
      ENV.fetch("FRONTEND_URL", "http://localhost:5173")
    end
  end
end
