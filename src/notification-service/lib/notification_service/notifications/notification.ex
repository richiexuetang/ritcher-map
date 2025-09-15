defmodule NotificationService.Notifications.Notification do
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "notifications" do
    field(:user_id, :binary_id)
    field(:title, :string)
    field(:body, :string)
    field(:type, :string)
    field(:channel, :string)
    field(:status, :string, default: "pending")
    field(:priority, :string, default: "normal")
    field(:scheduled_at, :utc_datetime)
    field(:sent_at, :utc_datetime)
    field(:read_at, :utc_datetime)
    field(:metadata, :map, default: %{})
    field(:template_id, :binary_id)
    field(:game_id, :binary_id)
    field(:related_type, :string)
    field(:related_id, :binary_id)
    field(:error_message, :string)
    field(:retry_count, :integer, default: 0)
    field(:max_retries, :integer, default: 3)

    timestamps(type: :utc_datetime)
  end

  @required_fields [:user_id, :title, :body, :type, :channel]
  @optional_fields [
    :status,
    :priority,
    :scheduled_at,
    :sent_at,
    :read_at,
    :metadata,
    :template_id,
    :game_id,
    :related_type,
    :related_id,
    :error_message,
    :retry_count,
    :max_retries
  ]

  @valid_types [
    "game_update",
    "marker_created",
    "guide_published",
    "comment_reply",
    "rating_received",
    "system_maintenance",
    "welcome",
    "reminder"
  ]
  @valid_channels ["email", "push", "in_app", "sms"]
  @valid_statuses ["pending", "sent", "delivered", "failed", "cancelled"]
  @valid_priorities ["low", "normal", "high", "urgent"]

  def changeset(notification, attrs) do
    notification
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_inclusion(:type, @valid_types)
    |> validate_inclusion(:channel, @valid_channels)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:priority, @valid_priorities)
    |> validate_length(:title, max: 255)
    |> validate_length(:body, max: 2000)
    |> validate_number(:retry_count, greater_than_or_equal_to: 0)
    |> validate_number(:max_retries, greater_than_or_equal_to: 0)
  end

  def for_user(query \\ __MODULE__, user_id) do
    from(n in query, where: n.user_id == ^user_id)
  end

  def by_status(query \\ __MODULE__, status) do
    from(n in query, where: n.status == ^status)
  end

  def by_channel(query \\ __MODULE__, channel) do
    from(n in query, where: n.channel == ^channel)
  end

  def by_type(query \\ __MODULE__, type) do
    from(n in query, where: n.type == ^type)
  end

  def pending(query \\ __MODULE__) do
    from(n in query, where: n.status == "pending")
  end

  def scheduled_before(query \\ __MODULE__, datetime) do
    from(n in query,
      where: n.scheduled_at <= ^datetime or is_nil(n.scheduled_at)
    )
  end

  def unread(query \\ __MODULE__) do
    from(n in query, where: is_nil(n.read_at))
  end

  def recent(query \\ __MODULE__, days \\ 7) do
    cutoff = DateTime.utc_now() |> DateTime.add(-days * 24 * 60 * 60, :second)
    from(n in query, where: n.inserted_at >= ^cutoff)
  end

  def can_retry?(notification) do
    notification.retry_count < notification.max_retries and
      notification.status == "failed"
  end

  def mark_as_sent(notification) do
    changeset(notification, %{
      status: "sent",
      sent_at: DateTime.utc_now()
    })
  end

  def mark_as_failed(notification, error_message) do
    changeset(notification, %{
      status: "failed",
      error_message: error_message,
      retry_count: notification.retry_count + 1
    })
  end

  def mark_as_read(notification) do
    changeset(notification, %{
      read_at: DateTime.utc_now()
    })
  end
end
