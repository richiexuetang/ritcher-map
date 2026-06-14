class DropSubscriptions < ActiveRecord::Migration[8.0]
  # Billing/premium was removed, so the subscriptions table (and its Stripe
  # columns) is no longer used. `if_exists` keeps this a no-op on a fresh DB
  # where the table was never created.
  def up
    drop_table :subscriptions, if_exists: true
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
