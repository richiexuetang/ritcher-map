import Config

config :notification_service,
  ecto_repos: [NotificationService.Repo],
  generators: [binary_id: true]

config :notification_service_web,
  endpoint: NotificationServiceWeb.Endpoint,
  secret_key_base: "your-secret-key-base"

# Oban configuration
config :notification_service, Oban,
  repo: NotificationService.Repo,
  plugins: [
    Oban.Plugins.Pruner,
    {Oban.Plugins.Cron, crontab: [
      # Cleanup expired notifications daily at 2 AM
      {"0 2 * * *", NotificationService.Workers.CleanupWorker, args: %{action: "cleanup_expired"}},
      # Cleanup old delivery attempts weekly
      {"0 2 * * 0", NotificationService.Workers.CleanupWorker, args: %{action: "cleanup_old_delivery_attempts"}}
    ]}
  ],
  queues: [
    notifications: 10,
    emails: 5,
    push_notifications: 15,
    maintenance: 1
  ]

# Email configuration
config :notification_service, NotificationService.Mailer,
  adapter: Swoosh.Adapters.SMTP,
  relay: System.get_env("SMTP_HOST"),
  port: 587,
  username: System.get_env("SMTP_USERNAME"),
  password: System.get_env("SMTP_PASSWORD"),
  tls: :if_available,
  auth: :always

# Push notification configuration
config :pigeon, :apns,
  apns_default: %{
    cert: System.get_env("APNS_CERT_PATH"),
    key: System.get_env("APNS_KEY_PATH"),
    mode: :dev
  }

config :pigeon, :fcm,
  fcm_default: %{
    key: System.get_env("FCM_SERVER_KEY")
  }

# Cachex configuration
config :cachex,
  template_cache: [
    limit: 1000,
    stats: true
  ]

# Redis configuration
config :redix,
  host: System.get_env("REDIS_HOST", "localhost"),
  port: String.to_integer(System.get_env("REDIS_PORT", "6379")),
  database: String.to_integer(System.get_env("REDIS_DB", "0"))

# Sentry configuration
config :sentry,
  dsn: System.get_env("SENTRY_DSN"),
  environment_name: Mix.env(),
  enable_source_code_context: true,
  root_source_code_path: File.cwd!(),
  tags: %{service: "notification-service"}

# Import environment specific config
import_config "#{config_env()}.exs"
