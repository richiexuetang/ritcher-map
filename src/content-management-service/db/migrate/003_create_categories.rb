# frozen_string_literal: true

class CreateCategories < ActiveRecord::Migration[7.1]
  def change
    create_table :categories do |t|
      t.references :game, null: false, foreign_key: true
      t.string :name, null: false
      t.string :slug, null: false
      t.string :icon
      t.string :color
      t.text :description
      t.integer :parent_id
      t.integer :display_order, default: 0
      t.boolean :is_active, default: true
      t.boolean :is_collectible, default: false
      t.jsonb :metadata, default: {}

      t.timestamps
    end

    add_index :categories, [:game_id, :slug], unique: true
    add_index :categories, :parent_id
    add_index :categories, :is_active
  end
end