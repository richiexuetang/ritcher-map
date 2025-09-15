defmodule NotificationService.Services.NotificationService do
  alias NotificationService.Repo
  alias NotificationService.Notifications.{Notification, Template}
  alias NotificationService.Services.{EmailService, TemplateService}
  alias NotificationService.Workers.{EmailWorker}

  import Ecto.Query

  def send_notification(attrs) do
    with {:ok, notification} <- create_notification(attrs),
         {:ok, notification} <- maybe_use_template(notification),
         {:ok, _job} <- enqueue_notification(notification) do
      {:ok, notification}
    else
      {:error, %Ecto.Changeset{} = changeset} ->
        {:error, changeset}

      error ->
        error
    end
  end

  def send_bulk_notifications(notifications_attrs) when is_list(notifications_attrs) do
    results =
      Enum.map(notifications_attrs, fn attrs ->
        case send_notification(attrs) do
          {:ok, notification} -> {:ok, notification.id}
          {:error, reason} -> {:error, reason}
        end
      end)

    successes = Enum.count(results, &match?({:ok, _}, &1))
    failures = Enum.count(results, &match?({:error, _}, &1))

    {:ok, %{successes: successes, failures: failures, results: results}}
  end

  def get_notifications_for_user(user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 50)
    offset = Keyword.get(opts, :offset, 0)
    unread_only = Keyword.get(opts, :unread_only, false)

    # Start with a proper query
    query =
      from(n in Notification,
        where: n.user_id == ^user_id,
        order_by: [desc: n.inserted_at],
        limit: ^limit,
        offset: ^offset,
        preload: []
      )

    query =
      if unread_only do
        from(n in query, where: is_nil(n.read_at))
      else
        query
      end

    Repo.all(query)
  end

  def mark_notification_as_read(notification_id, user_id) do
    case get_user_notification(notification_id, user_id) do
      nil ->
        {:error, "Notification not found"}

      notification ->
        notification
        |> Notification.mark_as_read()
        |> Repo.update()
    end
  end

  def mark_all_as_read(user_id) do
    {count, _} =
      from(n in Notification,
        where: n.user_id == ^user_id and is_nil(n.read_at)
      )
      |> Repo.update_all(set: [read_at: DateTime.utc_now()])

    {:ok, count}
  end

  def get_notification_stats(user_id) do
    # Use proper queries
    total = from(n in Notification, where: n.user_id == ^user_id) |> Repo.aggregate(:count)

    unread =
      from(n in Notification, where: n.user_id == ^user_id and is_nil(n.read_at))
      |> Repo.aggregate(:count)

    cutoff = DateTime.utc_now() |> DateTime.add(-7 * 24 * 60 * 60, :second)

    recent =
      from(n in Notification,
        where: n.user_id == ^user_id and n.inserted_at >= ^cutoff
      )
      |> Repo.aggregate(:count)

    %{
      total: total,
      unread: unread,
      recent: recent
    }
  end

  def process_notification(notification) do
    case notification.channel do
      "email" -> EmailService.send_email(notification)
      "in_app" -> handle_in_app_notification(notification)
      _ -> {:error, "Unsupported channel: #{notification.channel}"}
    end
  end

  def retry_failed_notification(notification_id) do
    case Repo.get(Notification, notification_id) do
      nil ->
        {:error, "Notification not found"}

      notification ->
        if Notification.can_retry?(notification) do
          enqueue_notification(notification)
        else
          {:error, "Maximum retries exceeded"}
        end
    end
  end

  def cancel_notification(notification_id) do
    case Repo.get(Notification, notification_id) do
      nil ->
        {:error, "Notification not found"}

      notification ->
        notification
        |> Notification.changeset(%{status: "cancelled"})
        |> Repo.update()
    end
  end

  # Private functions

  defp create_notification(attrs) do
    %Notification{}
    |> Notification.changeset(attrs)
    |> Repo.insert()
  end

  defp maybe_use_template(notification) do
    if notification.template_id do
      case TemplateService.render_notification(notification) do
        {:ok, rendered_notification} -> {:ok, rendered_notification}
        # Fall back to original
        {:error, _} -> {:ok, notification}
      end
    else
      {:ok, notification}
    end
  end

  defp enqueue_notification(notification) do
    case notification.channel do
      "email" ->
        %{notification_id: notification.id}
        |> EmailWorker.new(scheduled_at: notification.scheduled_at)
        |> Oban.insert()

      "in_app" ->
        # In-app notifications are processed immediately
        handle_in_app_notification(notification)
        {:ok, :immediate}

      _ ->
        {:error, "Unsupported channel"}
    end
  end

  defp handle_in_app_notification(notification) do
    # Broadcast to Phoenix PubSub for real-time delivery
    Phoenix.PubSub.broadcast(
      NotificationService.PubSub,
      "user:#{notification.user_id}",
      {:new_notification, notification}
    )

    # Mark as sent immediately
    notification
    |> Notification.mark_as_sent()
    |> Repo.update()
  end

  defp get_user_notification(notification_id, user_id) do
    from(n in Notification,
      where: n.id == ^notification_id and n.user_id == ^user_id
    )
    |> Repo.one()
  end
end
