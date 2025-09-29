require_relative "boot"
require "rails"
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
require "action_view/railtie"
require "rails/test_unit/railtie"

Bundler.require(*Rails.groups)

module RitcherCms
  class Application < Rails::Application
    config.load_defaults 7.0
    config.api_only = true

    # Active Job with Sidekiq
    config.active_job.queue_adapter = :sidekiq

    # CORS configuration
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins ENV.fetch("ALLOWED_ORIGINS", "*").split(",")
        resource "*",
                 headers: :any,
                 methods: [ :get, :post, :put, :patch, :delete, :options, :head ],
                 expose: %w[X-Total-Count X-Page X-Per-Page]
      end
    end

    # UUID primary keys
    config.generators do |g|
      g.orm :active_record, primary_key_type: :uuid
    end
  end
end
