require_relative "boot"

require "rails"
# Only the frameworks this API service needs (no asset pipeline, views, mailer UI).
require "active_model/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "rails/test_unit/railtie"   # registers the `rails test` command + rake task

Bundler.require(*Rails.groups)

module Accounts
  class Application < Rails::Application
    config.load_defaults 8.0

    # API-only: no cookies/sessions/flash middleware, JSON by default.
    config.api_only = true

    # Eager-load app/services (and any other top-level app/ dirs) in all envs.
    config.autoload_paths << Rails.root.join("app", "services")
  end
end
