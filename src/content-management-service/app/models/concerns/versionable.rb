module Versionable
  extend ActiveSupport::Concern

  included do
    has_paper_trail versions: {
      class_name: "#{self.name}Version"
    }
  end

  def version_at(timestamp)
    version = versions.where('created_at <= ?', timestamp).last
    version ? version.reify : self
  end

  def changes_between(start_date, end_date)
    versions.where(created_at: start_date..end_date)
  end
end