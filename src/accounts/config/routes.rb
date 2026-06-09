Rails.application.routes.draw do
  get "/healthz", to: "health#show"

  # Public auth. The gateway proxies /auth/* here without requiring a token.
  namespace :auth do
    post "register", to: "registrations#create"
    post "login",    to: "sessions#create"
  end

  # Authenticated. The gateway proxies /account/* with a validated token.
  namespace :account do
    get "me", to: "profiles#show"
  end

  # Billing. /billing/checkout is authenticated; /billing/webhook is called by
  # Stripe directly and verified by signature.
  namespace :billing do
    post "checkout", to: "checkouts#create"
    post "webhook",  to: "webhooks#create"
  end
end
