defmodule NotificationService.MixProject do
  use Mix.Project

  def project do
    [
      app: :notification_service,
      version: "1.0.0",
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps()
    ]
  end

  def application do
    [
      mod: {NotificationService.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      # Phoenix Framework
      {:phoenix, "~> 1.7.7"},
      {:phoenix_ecto, "~> 4.4"},
      {:phoenix_html, "~> 3.3"},
      {:phoenix_live_reload, "~> 1.2", only: :dev},
      {:phoenix_live_view, "~> 0.20.0"},
      {:phoenix_live_dashboard, "~> 0.8.0"},
      {:phoenix_pubsub, "~> 2.1"},

      # Database
      {:ecto_sql, "~> 3.10"},
      {:postgrex, ">= 0.0.0"},

      # JSON
      {:jason, "~> 1.4"},
      {:poison, "~> 5.0"},

      # HTTP Client
      {:httpoison, "~> 2.1"},
      {:req, "~> 0.4.0"},

      # Email
      {:swoosh, "~> 1.13"},
      {:finch, "~> 0.16"},
      {:bamboo, "~> 2.3"},

      # Background Jobs
      {:oban, "~> 2.15"},

      # Push Notifications
      {:pigeon, "~> 2.0"},
      {:kadabra, "~> 0.6.1"}, # HTTP/2 for APNs

      # Caching & Redis
      {:redix, "~> 1.2"},
      {:cachex, "~> 3.6"},

      # Authentication & Security
      {:joken, "~> 2.6"},
      {:bcrypt_elixir, "~> 3.0"},

      # Monitoring
      {:telemetry_metrics, "~> 0.6"},
      {:telemetry_poller, "~> 1.0"},
      {:sentry, "~> 10.0"},

      # Utilities
      {:timex, "~> 3.7"},
      {:uuid, "~> 1.1"},
      {:ex_machina, "~> 2.7", only: :test},

      # Development
      {:plug_cowboy, "~> 2.5"},
      {:floki, ">= 0.30.0", only: :test}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      "ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"]
    ]
  end
end
