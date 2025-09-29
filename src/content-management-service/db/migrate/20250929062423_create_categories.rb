class CreateCategories < ActiveRecord::Migration[8.0]
  def change
    create_table :categories, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :icon
      t.string :color
      t.text :description
      t.references :game, type: :uuid, foreign_key: true, null: false
      t.references :parent, type: :uuid, foreign_key: { to_table: :categories }
      t.integer :display_order, default: 0
      t.timestamps
    end

    add_index :categories, [:game_id, :slug], unique: true
    add_index :categories, :display_order
  end
end
