# frozen_string_literal: true

class CreateTags < ActiveRecord::Migration[7.1]
  def change
    create_table :tags do |t|
      t.string :name, null: false
      t.string :slug, null: false, index: { unique: true }
      t.string :tag_type # difficulty, region, completion, etc.
      t.string :color
      t.text :description
      t.jsonb :metadata, default: {}

      t.timestamps
    end

    create_table :game_tags do |t|
      t.references :game, null: false, foreign_key: true
      t.references :tag, null: false, foreign_key: true

      t.timestamps
    end

    add_index :game_tags, [:game_id, :tag_id], unique: true
    add_index :tags, :tag_type
  end
end

