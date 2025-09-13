defmodule NotificationService.Repo.Migrations.CreateNotifications do
  use Ecto.Migration

  def change do
    create table(:notifications, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, :string, null: false
      add :type, :string, null: false
      add :title, :string, null: false
      add :body, :text, null: false
      add :data, :map, default: %{}
      add :channels, {:array, :string}, default: []
      add :priority, :string, default: "normal"
      add :status, :string, default: "pending"
      add :scheduled_for, :utc_datetime
      add :sent_at, :utc_datetime
      add :read_at, :utc_datetime
      add :expires_at, :utc_datetime
      add :source_service, :string
      add :source_id, :string
      add :template_id, :string
      add :locale, :string, default: "en"
      add :delivery_attempts, :integer, default: 0
      add :last_error, :text
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime)
    end

    create index(:notifications, [:user_id])
    create index(:notifications, [:type])
    create index(:notifications, [:status])
    create index(:notifications, [:scheduled_for])
    create index(:notifications, [:priority])
    create index(:notifications, [:source_service, :source_id])
    create index(:notifications, [:inserted_at])
  end
end

# priv/repo/migrations/002_create_user_preferences.exs
defmodule NotificationService.Repo.Migrations.CreateUserPreferences do
  use Ecto.Migration

  def change do
    create table(:user_preferences, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, :string, null: false
      add :email, :string
      add :push_token, :string
      add :device_type, :string # ios, android, web
      add :timezone, :string, default: "UTC"
      add :language, :string, default: "en"
      add :email_enabled, :boolean, default: true
      add :push_enabled, :boolean, default: true
      add :in_app_enabled, :boolean, default: true
      add :email_frequency, :string, default: "immediate" # immediate, daily, weekly
      add :quiet_hours_start, :time
      add :quiet_hours_end, :time
      add :notification_types, :map, default: %{}
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:user_preferences, [:user_id])
    create index(:user_preferences, [:email])
    create index(:user_preferences, [:push_token])
  end
end

# priv/repo/migrations/003_create_notification_templates.exs
defmodule NotificationService.Repo.Migrations.CreateNotificationTemplates do
  use Ecto.Migration

  def change do
    create table(:notification_templates, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :type, :string, null: false
      add :locale, :string, null: false
      add :subject, :string # for email
      add :title, :string
      add :body, :text, null: false
      add :html_body, :text # for email
      add :data_schema, :map, default: %{} # JSON schema for template variables
      add :is_active, :boolean, default: true
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:notification_templates, [:name, :type, :locale])
    create index(:notification_templates, [:type])
    create index(:notification_templates, [:is_active])
  end
end

# priv/repo/migrations/004_create_delivery_attempts.exs
defmodule NotificationService.Repo.Migrations.CreateDeliveryAttempts do
  use Ecto.Migration

  def change do
    create table(:delivery_attempts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :notification_id, references(:notifications, type: :binary_id), null: false
      add :channel, :string, null: false
      add :status, :string, null: false # pending, sent, failed, retrying
      add :attempt_count, :integer, default: 0
      add :last_attempted_at, :utc_datetime
      add :delivered_at, :utc_datetime
      add :error_message, :text
      add :response_data, :map, default: %{}
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime)
    end

    create index(:delivery_attempts, [:notification_id])
    create index(:delivery_attempts, [:channel])
    create index(:delivery_attempts, [:status])
    create index(:delivery_attempts, [:last_attempted_at])
  end
end
