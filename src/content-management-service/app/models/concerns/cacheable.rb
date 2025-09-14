module Cacheable
  extend ActiveSupport::Concern

  included do
    after_commit :expire_cache
  end

  def cache_key_with_version
    "#{model_name.cache_key}/#{id}-#{updated_at.to_i}"
  end

  def expire_cache
    Rails.cache.delete(cache_key_with_version)
    Rails.cache.delete_matched("#{model_name.cache_key}/#{id}/*")
  end

  class_methods do
    def cached_find(id)
      Rails.cache.fetch("#{cache_key}/#{id}", expires_in: 1.hour) do
        find(id)
      end
    end
  end
end