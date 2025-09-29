# frozen_string_literal: true

module Api
  module V1
    class CategoriesController < ApplicationController
      before_action :set_game, only: [ :index, :create ]
      before_action :set_category, only: [ :show, :update, :destroy ]

      def index
        @categories = @game.categories.includes(:subcategories).root_categories.ordered
        render json: @categories.as_json(include: :subcategories)
      end

      def show
        render json: @category.as_json(include: :subcategories)
      end

      def create
        @category = @game.categories.build(category_params)

        if @category.save
          render json: @category, status: :created
        else
          render json: { errors: @category.errors }, status: :unprocessable_entity
        end
      end

      def update
        if @category.update(category_params)
          render json: @category
        else
          render json: { errors: @category.errors }, status: :unprocessable_entity
        end
      end

      def destroy
        @category.destroy
        head :no_content
      end

      private

      def set_game
        @game = Game.find(params[:game_id])
      end

      def set_category
        @category = Category.find(params[:id])
      end

      def category_params
        params.require(:category).permit(:name, :slug, :icon, :color,
                                         :description, :parent_id,
                                         :display_order, :visible)
      end
    end
  end
end


