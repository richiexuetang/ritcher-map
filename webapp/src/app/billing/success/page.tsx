import Link from 'next/link';

// Stripe Checkout success_url target ({FRONTEND_URL}/billing/success on the
// accounts service). The webhook flips the subscription to active, so this
// page only needs to send the user back to their account.
export default function BillingSuccessPage() {
  return (
    <div className="rm-page">
      <main className="rm-page-main rm-page-center">
        <h1 className="rm-page-title">Payment complete 🎉</h1>
        <p>
          Your premium subscription is being activated — it can take a few
          seconds to show up.
        </p>
        <Link className="rm-btn rm-btn-primary" href="/account">
          Back to account
        </Link>
      </main>
    </div>
  );
}
