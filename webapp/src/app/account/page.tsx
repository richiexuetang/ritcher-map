'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { getMe, startCheckout } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import type { MeResponse } from '@/lib/types';

export default function AccountPage() {
  const { token, loading } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    getMe()
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your account.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const { checkout_url } = await startCheckout();
      window.location.href = checkout_url;
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? 'Billing is not configured.'
          : 'Could not start checkout.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="rm-page">
      <SiteHeader />
      <main className="rm-page-main rm-page-narrow">
        <h1 className="rm-page-title">Account</h1>

        {loading ? (
          <p className="rm-loading">Loading…</p>
        ) : !token ? (
          <p className="rm-empty">
            You are not logged in — use the button in the header, then come
            back here.
          </p>
        ) : (
          <div className="rm-panel rm-account-panel">
            <div className="rm-account-row">
              <span className="rm-account-label">Email</span>
              <span>{me?.email ?? '…'}</span>
            </div>
            <div className="rm-account-row">
              <span className="rm-account-label">Plan</span>
              {me?.premium ? (
                <span className="rm-premium-badge">Premium</span>
              ) : (
                <span>Free</span>
              )}
            </div>
            {me?.subscription && (
              <div className="rm-account-row">
                <span className="rm-account-label">Subscription</span>
                <span>
                  {me.subscription.status}
                  {me.subscription.current_period_end
                    ? ` · renews ${new Date(
                        me.subscription.current_period_end,
                      ).toLocaleDateString()}`
                    : ''}
                </span>
              </div>
            )}
            {me && !me.premium && (
              <button
                type="button"
                className="rm-btn rm-btn-primary"
                onClick={upgrade}
                disabled={busy}
              >
                {busy ? 'Redirecting…' : 'Upgrade to Premium'}
              </button>
            )}
            {error && <p className="rm-error-inline rm-error">{error}</p>}
          </div>
        )}

        <p>
          <Link href="/">← Back to all games</Link>
        </p>
      </main>
    </div>
  );
}
