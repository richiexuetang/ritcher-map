class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable
  rescue_from ActionController::ParameterMissing, with: :render_bad_request

  private

  def render_not_found(_e)
    render json: { error: "not found" }, status: :not_found
  end

  def render_unprocessable(e)
    render json: { error: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  def render_bad_request(e)
    render json: { error: e.message }, status: :bad_request
  end
end
