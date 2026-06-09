class CreateSubscriptions < ActiveRecord::Migration[8.0]
  def change
    create_table :subscriptions, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: true,
                          index: { unique: true }
      t.string   :status, null: false, default: "free"
      t.string   :stripe_customer_id
      t.string   :stripe_subscription_id
      t.datetime :current_period_end
      t.timestamps
    end

    add_index :subscriptions, :stripe_customer_id,
              unique: true, where: "stripe_customer_id IS NOT NULL"
    add_index :subscriptions, :stripe_subscription_id,
              unique: true, where: "stripe_subscription_id IS NOT NULL"
  end
end
