import Config

config :notification_service, NotificationService.Repo,
  url: System.get_env("DATABASE_URL"),
  pool_size: String.to_integer(System.get_env("POOL_SIZE", "10"))

config :notification_service_web, NotificationServiceWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))],
  url: [host: System.get_env("HOST"), port: 443, scheme: "https"],
  check_origin: false,
  code_reloader: false,
  cache_static_manifest: "priv/static/cache_manifest.json",
  server: true

# Push notification production config
config :pigeon, :apns,
  apns_default: %{
    cert: System.get_env("APNS_CERT_PATH"),
    key: System.get_env("APNS_KEY_PATH"),
    mode: :prod
  }

config :logger, level: :info
