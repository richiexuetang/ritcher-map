# frozen_string_literal: true

module Api
  module V1
    class MapsController < ApplicationController
      before_action :set_game

      def upload
        @map = @game.maps.build(map_params)
        @map.thumbnail.attach(params[:file])

        if @map.save
          render json: {
            id: @map.id,
            message: "Map uploaded successfully. Tile generation in progress."
          }, status: :accepted
        else
          render json: { errors: @map.errors }, status: :unprocessable_entity
        end
      end

      def status
        @map = @game.maps.find(params[:map_id])
        render json: {
          id: @map.id,
          tile_settings: @map.tile_settings
        }
      end

      private

      def set_game
        @game = Game.find(params[:game_id])
      end

      def map_params
        params.permit(:name, :min_zoom, :max_zoom, tile_settings: {})
      end
    end
  end
end
