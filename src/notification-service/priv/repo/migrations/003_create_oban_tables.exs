defmodule NotificationService.Repo.Migrations.CreateObanTables do
  use Ecto.Migration
  use Oban.Migration

  def up, do: Oban.Migration.up(version: 11)
  def down, do: Oban.Migration.down(version: 1)
end
