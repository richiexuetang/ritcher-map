defmodule NotificationServiceWeb.NotificationView do
  use NotificationServiceWeb, :view

  def render("notification.json", %{notification: notification}) do
    %{
      id: notification.id,
      user_id: notification.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      channel: notification.channel,
      status: notification.status,
      priority: notification.priority,
      scheduled_at: notification.scheduled_at,
      sent_at: notification.sent_at,
      read_at: notification.read_at,
      metadata: notification.metadata,
      game_id: notification.game_id,
      related_type: notification.related_type,
      related_id: notification.related_id,
      created_at: notification.inserted_at,
      updated_at: notification.updated_at
    }
  end

  def render("notifications.json", %{notifications: notifications}) do
    %{
      notifications: Enum.map(notifications, &render("notification.json", %{notification: &1}))
    }
  end

  def render("errors.json", %{changeset: changeset}) do
    %{
      errors:
        Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
          Enum.reduce(opts, message, fn {key, value}, acc ->
            String.replace(acc, "%{#{key}}", to_string(value))
          end)
        end)
    }
  end
end
