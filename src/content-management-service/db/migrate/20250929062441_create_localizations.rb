class CreateLocalizations < ActiveRecord::Migration[8.0]
  def change
    create_table :localizations do |t|
      t.string :locale, null: false
      t.string :key, null: false
      t.text :value
      t.references :translatable, type: :uuid, polymorphic: true
      t.timestamps
    end

    add_index :localizations, [:locale, :key], unique: true, where: "translatable_id IS NULL"
    add_index :localizations, [:translatable_type, :translatable_id, :locale, :key],
              unique: true, name: 'index_localizations_unique'
  end
end
