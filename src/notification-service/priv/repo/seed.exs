# Script for populating the database. You can run it as:
#
#     mix run priv/repo/seeds.exs

alias NotificationService.Repo
alias NotificationService.Notifications.{Template}

# Create default templates
templates = [
  %{
    name: "welcome_email",
    type: "welcome",
    channel: "email",
    subject_template: "Welcome to {{app_name}}!",
    body_template: """
    <h1>Welcome to {{app_name}}, {{username}}!</h1>
    <p>Thanks for joining our community of map explorers.</p>
    <p>Get started by visiting: {{welcome_url}}</p>
    """,
    variables: ["app_name", "username", "welcome_url"]
  },
  %{
    name: "marker_created_push",
    type: "marker_created",
    channel: "push",
    subject_template: "New marker added!",
    body_template: "A new {{marker_type}} was added to {{game_name}}",
    variables: ["marker_type", "game_name", "marker_url"]
  },
  %{
    name: "game_update_email",
    type: "game_update",
    channel: "email",
    subject_template: "{{game_name}} has been updated!",
    body_template: """
    <h2>{{game_name}} Update</h2>
    <p>{{update_description}}</p>
    <p><a href="{{game_url}}">Check it out now!</a></p>
    """,
    variables: ["game_name", "update_description", "game_url"]
  }
]

Enum.each(templates, fn template_attrs ->
  case Repo.get_by(Template,
         name: template_attrs.name,
         type: template_attrs.type,
         channel: template_attrs.channel
       ) do
    nil ->
      %Template{}
      |> Template.changeset(template_attrs)
      |> Repo.insert!()

      IO.puts("Created template: #{template_attrs.name}")

    _existing ->
      IO.puts("Template already exists: #{template_attrs.name}")
  end
end)

IO.puts("Seeding completed!")
