# frozen_string_literal: true

# CreateGames
class CreateGames < ActiveRecord::Migration[7.1]
  def change
    create_table :games do |t|
      t.string :title, null: false
      t.string :slug, null: false, index: { unique: true }
      t.text :description
      t.string :status, default: 'draft'
      t.jsonb :metadata, default: {}
      t.string :thumbnail_url
      t.string :banner_url
      t.integer :display_order, default: 0
      t.boolean :featured, default: false
      t.jsonb :settings, default: {}

      t.timestamps
    end

    add_index :games, :metadata, using: :gin
    add_index :games, :status
    add_index :games, :featured
  end
end
