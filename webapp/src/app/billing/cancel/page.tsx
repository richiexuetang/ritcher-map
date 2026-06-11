import Link from 'next/link';

// Stripe Checkout cancel_url target — nothing was charged.
export default function BillingCancelPage() {
  return (
    <div className="rm-page">
      <main className="rm-page-main rm-page-center">
        <h1 className="rm-page-title">Checkout canceled</h1>
        <p>No charge was made. You can upgrade any time from your account.</p>
        <Link className="rm-btn" href="/account">
          Back to account
        </Link>
      </main>
    </div>
  );
}
