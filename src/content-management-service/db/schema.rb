# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_09_29_062441) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.string "icon"
    t.string "color"
    t.text "description"
    t.uuid "game_id", null: false
    t.uuid "parent_id"
    t.integer "display_order", default: 0
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["display_order"], name: "index_categories_on_display_order"
    t.index ["game_id", "slug"], name: "index_categories_on_game_id_and_slug", unique: true
    t.index ["game_id"], name: "index_categories_on_game_id"
    t.index ["parent_id"], name: "index_categories_on_parent_id"
  end

  create_table "games", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.text "description"
    t.jsonb "metadata", default: {}
    t.integer "max_zoom", default: 18
    t.integer "min_zoom", default: 1
    t.integer "default_zoom", default: 3
    t.jsonb "map_bounds"
    t.string "thumbnail_url"
    t.string "cover_image_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["metadata"], name: "index_games_on_metadata", using: :gin
    t.index ["slug"], name: "index_games_on_slug", unique: true
  end

  create_table "localizations", force: :cascade do |t|
    t.string "locale", null: false
    t.string "key", null: false
    t.text "value"
    t.string "translatable_type"
    t.uuid "translatable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["locale", "key"], name: "index_localizations_on_locale_and_key", unique: true, where: "(translatable_id IS NULL)"
    t.index ["translatable_type", "translatable_id", "locale", "key"], name: "index_localizations_unique", unique: true
    t.index ["translatable_type", "translatable_id"], name: "index_localizations_on_translatable"
  end

  create_table "maps", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "game_id", null: false
    t.string "name", null: false
    t.string "file_path"
    t.jsonb "tile_settings", default: {}
    t.integer "width"
    t.integer "height"
    t.integer "min_zoom", default: 1
    t.integer "max_zoom", default: 18
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["game_id"], name: "index_maps_on_game_id"
  end

  create_table "taggables", force: :cascade do |t|
    t.uuid "tag_id"
    t.string "taggable_type"
    t.uuid "taggable_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["tag_id"], name: "index_taggables_on_tag_id"
    t.index ["taggable_id", "taggable_type", "tag_id"], name: "index_taggables_unique", unique: true
    t.index ["taggable_type", "taggable_id"], name: "index_taggables_on_taggable"
  end

  create_table "tags", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.uuid "game_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["game_id"], name: "index_tags_on_game_id"
    t.index ["slug"], name: "index_tags_on_slug", unique: true
  end

  add_foreign_key "categories", "categories", column: "parent_id"
  add_foreign_key "categories", "games"
  add_foreign_key "maps", "games"
  add_foreign_key "taggables", "tags"
  add_foreign_key "tags", "games"
end
