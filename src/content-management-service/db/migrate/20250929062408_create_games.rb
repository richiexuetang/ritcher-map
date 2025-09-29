class CreateGames < ActiveRecord::Migration[8.0]
  def change
    create_table :games, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false, index: { unique: true }
      t.text :description
      t.jsonb :metadata, default: {}
      t.integer :max_zoom, default: 18
      t.integer :min_zoom, default: 1
      t.integer :default_zoom, default: 3
      t.jsonb :map_bounds
      t.string :thumbnail_url
      t.string :cover_image_url
      t.timestamps
    end

    add_index :games, :metadata, using: :gin
  end
end
