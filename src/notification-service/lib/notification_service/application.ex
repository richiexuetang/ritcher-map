defmodule NotificationService.Application do
  @moduledoc false

  use Application
  alias NotificationService.{Repo}
  alias NotificationServiceWeb.Endpoint

  require Logger

  @impl true
  def start(_type, _args) do
  end

  # Private
  defp validate_configuration! do
    required_configs = [
      {:notification_service, NotificationService.Repo},
      {:notification_service, Oban}
    ]
  end
end
