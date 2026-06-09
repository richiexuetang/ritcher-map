# Configure Stripe from the environment. Absent keys are fine — the app boots
# without billing, and billing endpoints respond 503 until configured.
if defined?(Stripe) && ENV["STRIPE_SECRET_KEY"].present?
  Stripe.api_key = ENV["STRIPE_SECRET_KEY"]
  Stripe.api_version = "2024-06-20"
end
