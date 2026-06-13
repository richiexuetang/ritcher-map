'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { LoginForm } from '@/lib/auth/LoginForm';

/** Top bar for the content pages (the map page has its own sidebar chrome). */
export function SiteHeader() {
  const { user, token, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <header className="rm-header">
      <Link href="/" className="rm-header-brand">
        RitcherMap
      </Link>
      <div className="rm-header-actions">
        {token ? (
          <>
            {user?.admin && (
              <Link href="/admin" className="rm-btn">
                Admin
              </Link>
            )}
            {user?.premium && <span className="rm-premium-badge">Premium</span>}
            <Link href="/account" className="rm-user-email">
              {user?.email ?? 'Account'}
            </Link>
            <button type="button" className="rm-btn" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rm-btn rm-btn-primary"
            onClick={() => setShowLogin(true)}
          >
            Log in
          </button>
        )}
      </div>

      {showLogin && !token && (
        <div className="rm-modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
            <LoginForm onClose={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
