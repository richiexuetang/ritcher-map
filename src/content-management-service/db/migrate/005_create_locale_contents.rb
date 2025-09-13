# frozen_string_literal: true

class CreateLocaleContents < ActiveRecord::Migration[7.1]
  def change
    create_table :locale_contents do |t|
      t.references :translatable, polymorphic: true, null: false
      t.string :locale, null: false
      t.string :field_name, null: false
      t.text :content
      t.jsonb :metadata, default: {}

      t.timestamps
    end

    add_index :locale_contents,
              [:translatable_type, :translatable_id, :locale, :field_name],
              unique: true,
              name: 'index_locale_contents_uniqueness'
    add_index :locale_contents, :locale
  end
end

