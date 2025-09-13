
class CreateMaps < ActiveRecord::Migratoin[7.1]
  def change
    create_table :maps do |t|
      t.references :game, null: false, foreign_key: true
      t.string :name, null: false
      t.string :slug, null: false
      t.text :description
      t.integer :width
      t.integer :height
      t.integer :min_zoom, default: 0
      t.integer :max_zoom, default: 5
      t.jsonb :bounds, default: {}
      t.jsonb :tile_config, default: {}
      t.string :original_file_url
      t.string :processed_file_url
      t.string :processing_status, default: 'pending'
      t.text :processing_errors
      t.datetime :processed_at
      t.integer :display_order, default: 0
      t.boolean :is_default, default: false
      t.jsonb :metadata, default: {}

      t.timestamps
    end

    add_index :maps, [:game_id, :slug], unique: true
    add_index :maps, :processing_status
  end
end# frozen_string_literal: true

