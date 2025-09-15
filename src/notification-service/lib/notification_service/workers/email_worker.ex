defmodule NotificationService.Workers.EmailWorker do
  use Oban.Worker, queue: :emails, max_attempts: 3

  alias NotificationService.Repo
  alias NotificationService.Notifications.Notification
  alias NotificationService.Services.EmailService

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"notification_id" => notification_id}}) do
    case Repo.get(Notification, notification_id) do
      nil ->
        {:error, "Notification not found"}

      %{status: "cancelled"} ->
        {:cancel, "Notification was cancelled"}

      %{status: "sent"} ->
        {:ok, "Already sent"}

      notification ->
        EmailService.send_email(notification)
    end
  end
end
