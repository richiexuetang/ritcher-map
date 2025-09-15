defmodule NotificationService.Services.TemplateService do
  alias NotificationService.Repo
  alias NotificationService.Notifications.{Template, Notification}
  import Ecto.Query

  def render_notification(notification) do
    case Repo.get(Template, notification.template_id) do
      nil ->
        {:error, "Template not found"}

      template ->
        variables = build_template_variables(notification)
        {subject, body} = Template.render_template(template, variables)

        updated_notification = %{notification | title: subject || notification.title, body: body}

        {:ok, updated_notification}
    end
  end

  def create_template(attrs) do
    %Template{}
    |> Template.changeset(attrs)
    |> Repo.insert()
  end

  def get_template(id) do
    Repo.get(Template, id)
  end

  def list_templates(filters \\ %{}) do
    # Start with a proper Ecto query
    query = from(t in Template)

    query =
      if type = filters[:type] do
        from(t in query, where: t.type == ^type)
      else
        query
      end

    query =
      if channel = filters[:channel] do
        from(t in query, where: t.channel == ^channel)
      else
        query
      end

    query =
      if Map.get(filters, :active_only, true) do
        from(t in query, where: t.is_active == true)
      else
        query
      end

    Repo.all(query)
  end

  defp build_template_variables(notification) do
    base_variables = %{
      "user_id" => notification.user_id,
      "title" => notification.title,
      "body" => notification.body,
      "type" => notification.type,
      "created_at" => notification.inserted_at
    }

    # Add metadata variables
    metadata_variables = notification.metadata || %{}

    # Add type-specific variables
    type_variables =
      case notification.type do
        "welcome" ->
          %{
            "app_name" => "Ritcher Map",
            "welcome_url" => "https://ritcher.dev/welcome"
          }

        "game_update" ->
          %{
            "game_id" => notification.game_id,
            "game_url" => "https://ritcher.dev/games/#{notification.game_id}"
          }

        "marker_created" ->
          %{
            "marker_id" => notification.related_id,
            "marker_url" => "https://ritcher.dev/markers/#{notification.related_id}",
            "game_id" => notification.game_id
          }

        _ ->
          %{}
      end

    Map.merge(base_variables, Map.merge(metadata_variables, type_variables))
  end
end
