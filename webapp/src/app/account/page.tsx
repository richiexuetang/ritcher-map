'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { getMe } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import type { MeResponse } from '@/lib/types';

export default function AccountPage() {
  const { token, loading } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            {me?.admin && (
              <div className="rm-account-row">
                <span className="rm-account-label">Role</span>
                <span>Admin</span>
              </div>
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
