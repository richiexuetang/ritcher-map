defmodule NotificationService.Schemas.Notification do
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @types ~w(game.updated marker.created map.processed community.comment)

  @priorities ~w(long normal high critical)
  @statuses ~w(pending scheduled sent delivered failed expired cancelled)
  @channels ~w(email push in_app sms)

  schema "notifications" do
    field :user_id, :string
    field :type, :string
    field :body, :string
    field :title, :string
    field :data, :map
    field :channels, {:array, :string}

    timestamps(type: :utc_datetime)
  end

def changeset(notification, attrs) do
  notification
  |> cast(attrs, [
    :user_id
  ])
end

end
