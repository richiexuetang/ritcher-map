defmodule NotificationServiceWeb.NotificationController do
  use NotificationServiceWeb, :controller

  alias NotificationService.Services.NotificationService
  alias NotificationServiceWeb.NotificationView

  def send_notification(conn, params) do
    user_id = get_user_id(conn)

    notification_params =
      params
      |> Map.put("user_id", user_id)
      |> maybe_set_defaults()

    case NotificationService.send_notification(notification_params) do
      {:ok, notification} ->
        conn
        |> put_status(:created)
        |> render("notification.json", notification: notification)

      {:error, %Ecto.Changeset{} = changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("errors.json", changeset: changeset)

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: reason})
    end
  end

  def send_bulk(conn, %{"notifications" => notifications_list})
      when is_list(notifications_list) do
    user_id = get_user_id(conn)

    notifications_with_user =
      Enum.map(notifications_list, fn notification ->
        notification
        |> Map.put("user_id", user_id)
        |> maybe_set_defaults()
      end)

    case NotificationService.send_bulk_notifications(notifications_with_user) do
      {:ok, results} ->
        conn
        |> put_status(:created)
        |> json(results)

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: reason})
    end
  end

  def list(conn, params) do
    user_id = get_user_id(conn)

    opts = [
      limit: String.to_integer(params["limit"] || "50"),
      offset: String.to_integer(params["offset"] || "0"),
      unread_only: params["unread_only"] == "true"
    ]

    notifications = NotificationService.get_notifications_for_user(user_id, opts)

    conn
    |> render("notifications.json", notifications: notifications)
  end

  def stats(conn, _params) do
    user_id = get_user_id(conn)
    stats = NotificationService.get_notification_stats(user_id)

    conn
    |> json(stats)
  end

  def mark_read(conn, %{"id" => notification_id}) do
    user_id = get_user_id(conn)

    case NotificationService.mark_notification_as_read(notification_id, user_id) do
      {:ok, notification} ->
        conn
        |> render("notification.json", notification: notification)

      {:error, reason} ->
        conn
        |> put_status(:not_found)
        |> json(%{error: reason})
    end
  end

  def mark_all_read(conn, _params) do
    user_id = get_user_id(conn)

    case NotificationService.mark_all_as_read(user_id) do
      {:ok, count} ->
        conn
        |> json(%{marked_read: count})

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: reason})
    end
  end

  def cancel(conn, %{"id" => notification_id}) do
    case NotificationService.cancel_notification(notification_id) do
      {:ok, notification} ->
        conn
        |> render("notification.json", notification: notification)

      {:error, reason} ->
        conn
        |> put_status(:not_found)
        |> json(%{error: reason})
    end
  end

  def retry(conn, %{"id" => notification_id}) do
    case NotificationService.retry_failed_notification(notification_id) do
      {:ok, _job} ->
        conn
        |> json(%{message: "Notification queued for retry"})

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: reason})
    end
  end

  # Private functions

  defp get_user_id(conn) do
    # Extract from auth token/claims
    conn.assigns[:current_user_id] || "default-user-id"
  end

  defp maybe_set_defaults(params) do
    params
    |> Map.put_new("channel", "in_app")
    |> Map.put_new("priority", "normal")
    |> Map.put_new("type", "system")
  end
end
