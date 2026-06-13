# Admin flag management. No HTTP endpoint grants admin (deliberately — the
# flag gates the whole CMS), so it is flipped from the console:
#
#   bin/rails accounts:grant_admin EMAIL=you@example.com
#   bin/rails accounts:revoke_admin EMAIL=you@example.com
#
# Note: the admin claim is baked into the JWT at login, so a freshly granted
# admin must log in again before the gateway honors it.
namespace :accounts do
  desc "Grant admin to a user by EMAIL"
  task grant_admin: :environment do
    user = User.find_by!(email: ENV.fetch("EMAIL").downcase.strip)
    user.update!(admin: true)
    puts "#{user.email} is now an admin (re-login required for a new token)"
  end

  desc "Revoke admin from a user by EMAIL"
  task revoke_admin: :environment do
    user = User.find_by!(email: ENV.fetch("EMAIL").downcase.strip)
    user.update!(admin: false)
    puts "#{user.email} is no longer an admin"
  end
end
