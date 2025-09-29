# frozen_string_literal: true

module Api
  module V1
    class LocalesController < ApplicationController
      def show
        locale = params[:lang] || I18n.default_locale

        # Get global translations
        global_translations = Localization.global.for_locale(locale)
                                          .pluck(:key, :value).to_h

        # Get game-specific translations if game_id provided
        if params[:game_id].present?
          game = Game.find(params[:game_id])
          game_translations = game.localizations.for_locale(locale)
                                  .pluck(:key, :value).to_h

          categories_translations = Category.joins(:localizations)
                                            .where(game_id: game.id, localizations: { locale: locale })
                                            .pluck("categories.id", "localizations.key", "localizations.value")
                                            .group_by(&:first)
                                            .transform_values { |v| v.map { |_, k, val| [ k, val ] }.to_h }
        end

        render json: {
          locale: locale,
          translations: global_translations,
          game_translations: game_translations || {},
          categories_translations: categories_translations || {}
        }
      end

      def update
        locale = params[:lang]
        translations = params[:translations]

        translations.each do |key, value|
          localization = Localization.find_or_initialize_by(
            locale: locale,
            key: key,
            translatable_id: params[:translatable_id],
            translatable_type: params[:translatable_type]
          )
          localization.value = value
          localization.save!
        end

        render json: { message: "Translations updated successfully" }
      end
    end
  end
end
