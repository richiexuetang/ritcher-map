class AddAdminToUsers < ActiveRecord::Migration[8.0]
  def change
    # Gates catalog writes (CMS) at the gateway via the `admin` JWT claim.
    # Granted out-of-band: `bin/rails accounts:grant_admin EMAIL=...`
    add_column :users, :admin, :boolean, null: false, default: false
  end
end
