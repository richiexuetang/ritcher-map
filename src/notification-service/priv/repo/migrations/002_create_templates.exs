defmodule NotificationService.Repo.Migrations.CreateTemplates do
  use Ecto.Migration

  def change do
    create table(:templates, primary_key: false) do
      add(:id, :binary_id, primary_key: true)
      add(:name, :string, null: false, size: 100)
      add(:type, :string, null: false)
      add(:channel, :string, null: false)
      add(:subject_template, :text)
      add(:body_template, :text, null: false)
      add(:variables, {:array, :string}, default: [])
      add(:is_active, :boolean, default: true)
      add(:metadata, :map, default: %{})

      timestamps(type: :utc_datetime)
    end

    create(index(:templates, [:type]))
    create(index(:templates, [:channel]))
    create(index(:templates, [:is_active]))
    create(unique_index(:templates, [:name, :type, :channel]))
  end
end
