class CreateMaps < ActiveRecord::Migration[8.0]
  def change
    create_table :maps, id: :uuid do |t|
      t.references :game, type: :uuid, foreign_key: true, null: false
      t.string :name, null: false
      t.string :file_path
      t.jsonb :tile_settings, default: {}
      t.integer :width
      t.integer :height
      t.integer :min_zoom, default: 1
      t.integer :max_zoom, default: 18
      t.timestamps
    end
  end
end
