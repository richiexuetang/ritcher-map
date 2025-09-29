class ApplicationController < ActionController::API
  include ActionController::MimeResponds

  before_action :set_locale

  rescue_from ActiveRecord::RecordNotFound, with: :record_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :unprocessable_entity

  private

  def set_locale
    I18n.locale = "en"
  end

  def not_found(exception)
    render json: { error: exception.message }, status: :not_found
  end

  def unprocessable_entity(exception)
    render json: { error: exception.message, details: exception.record.errors }, status: :unprocessable_entity
  end

  # def pagination_meta(collection)
  #   {
  #     current_page: collection.current_page,
  #     next_page: collection.next_page,
  #     prev_page: collection.prev_page,
  #     total_pages: collection.total_pages,
  #     total_count: collection.total_count
  #   }
  # end
end
