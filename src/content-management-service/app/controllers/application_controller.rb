# frozen_string_literal: true

class ApplicationController < ActionController::API
  include ErrorHandler
  include Pagination

  before_action :authenticate_request
  before_action :set_locale
end