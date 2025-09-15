defmodule NotificationService.Notifications.Template do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "templates" do
    field(:name, :string)
    field(:type, :string)
    field(:channel, :string)
    field(:subject_template, :string)
    field(:body_template, :string)
    field(:variables, {:array, :string}, default: [])
    field(:is_active, :boolean, default: true)
    field(:metadata, :map, default: %{})

    timestamps(type: :utc_datetime)
  end

  @required_fields [:name, :type, :channel, :body_template]
  @optional_fields [:subject_template, :variables, :is_active, :metadata]

  def changeset(template, attrs) do
    template
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:name, max: 100)
    |> unique_constraint([:name, :type, :channel])
  end

  def render_template(template, variables) do
    rendered_subject = render_string(template.subject_template, variables)
    rendered_body = render_string(template.body_template, variables)

    {rendered_subject, rendered_body}
  end

  defp render_string(nil, _variables), do: nil

  defp render_string(template_string, variables) do
    Enum.reduce(variables, template_string, fn {key, value}, acc ->
      String.replace(acc, "{{#{key}}}", to_string(value))
    end)
  end
end
