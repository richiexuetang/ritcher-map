defmodule NotificationService.Services.EmailService do
  import Swoosh.Email
  alias NotificationService.Mailer
  alias NotificationService.Repo
  alias NotificationService.Notifications.Notification

  def send_email(notification) do
    case build_email(notification) do
      {:ok, email} ->
        case Mailer.deliver(email) do
          {:ok, _result} ->
            notification
            |> Notification.mark_as_sent()
            |> Repo.update()

          {:error, reason} ->
            error_message = format_error(reason)

            notification
            |> Notification.mark_as_failed(error_message)
            |> Repo.update()
        end

      {:error, reason} ->
        notification
        |> Notification.mark_as_failed(reason)
        |> Repo.update()
    end
  end

  defp build_email(notification) do
    try do
      email =
        new()
        |> to(get_user_email(notification.user_id))
        |> from({"Ritcher Map", "noreply@ritcher.dev"})
        |> subject(notification.title)
        |> html_body(render_html_body(notification))
        |> text_body(notification.body)
        |> maybe_add_headers(notification)

      {:ok, email}
    rescue
      error -> {:error, "Failed to build email: #{inspect(error)}"}
    end
  end

  defp get_user_email(user_id) do
    # In a real implementation, this would fetch from user service
    # For now, return a placeholder
    "user-#{user_id}@example.com"
  end

  defp render_html_body(notification) do
    case notification.type do
      "welcome" ->
        """
        <h1>Welcome to Ritcher Map!</h1>
        <p>#{notification.body}</p>
        <p>Happy mapping!</p>
        """

      "game_update" ->
        """
        <h2>#{notification.title}</h2>
        <p>#{notification.body}</p>
        #{maybe_render_game_link(notification)}
        """

      "marker_created" ->
        """
        <h2>New Marker Added</h2>
        <p>#{notification.body}</p>
        #{maybe_render_marker_link(notification)}
        """

      _ ->
        """
        <h2>#{notification.title}</h2>
        <p>#{notification.body}</p>
        """
    end
  end

  defp maybe_add_headers(email, notification) do
    case notification.priority do
      "urgent" ->
        email |> header("X-Priority", "1")

      "high" ->
        email |> header("X-Priority", "2")

      _ ->
        email
    end
  end

  defp maybe_render_game_link(notification) do
    if notification.game_id do
      """
      <p><a href="https://ritcher.dev/games/#{notification.game_id}">View Game</a></p>
      """
    else
      ""
    end
  end

  defp maybe_render_marker_link(notification) do
    if notification.related_id do
      """
      <p><a href="https://ritcher.dev/markers/#{notification.related_id}">View Marker</a></p>
      """
    else
      ""
    end
  end

  defp format_error(reason) do
    case reason do
      %{message: message} -> message
      _ -> inspect(reason)
    end
  end
end
