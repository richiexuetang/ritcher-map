# frozen_string_literal: true

module Api
  module V1
    class GamesController < ApplicationController
      before_action :set_game, only: [ :show, :update, :destroy ]

      def index
        @games = Game.includes(:categories)
        # @games = @games.published unless params[:include_drafts]
        # @games = @games.page(params[:page])

        render json: {
          games: @games.as_json(include: :categories),
          # meta: pagination_meta(@games)
        }
      end

      def show
        render json: @game.as_json(
          include: {
            categories: { only: [:id, :name, :slug, :icon, :color] },
            tags: { only: [:id, :name, :slug] }
          },
          methods: [:localized_name]
        )
      end

      def create
        @game = Game.new(game_params)

        if @game.save
          render json: @game, status: :created
        else
          render json: { errors: @game.errors }, status: :unprocessable_entity
        end
      end

      def update
        if @game.update(game_params)
          render json: @game
        else
          render json: { errors: @game.errors }, status: :unprocessable_entity
        end
      end

      def destroy
        @game.destroy
        head :no_content
      end

      private

      def set_game
        @game = Game.find(params[:id])
      end

      def game_params
        params.require(:game).permit(:name, :slug, :description, :status,
                                     :max_zoom_level, :map_bounds,
                                     :cover_image, :thumbnail, metadata: {})
      end
    end
  end
end