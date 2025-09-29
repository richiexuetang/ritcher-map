class CreateTags < ActiveRecord::Migration[8.0]
  def change
    create_table :tags, id: :uuid do |t|
      t.string :name, null: false
      t.string :slug, null: false, index: { unique: true }
      t.references :game, type: :uuid, foreign_key: true
      t.timestamps
    end

    create_table :taggables do |t|
      t.references :tag, type: :uuid, foreign_key: true
      t.references :taggable, type: :uuid, polymorphic: true
      t.timestamps
    end

    add_index :taggables, [:taggable_id, :taggable_type, :tag_id], unique: true, name: 'index_taggables_unique'
  end
end
