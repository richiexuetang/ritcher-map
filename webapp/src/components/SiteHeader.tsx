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
    <header className="flex items-center justify-between gap-4 border-b border-edge px-6 py-3.5">
      <Link
        href="/"
        className="text-lg font-bold tracking-[0.2px] text-fg hover:text-accent hover:no-underline"
      >
        RitcherMap
      </Link>
      <div className="flex items-center gap-2.5">
        {token ? (
          <>
            {user?.admin && (
              <Link href="/admin" className="btn">
                Admin
              </Link>
            )}
            <span className="max-w-[180px] truncate text-[13px] text-fg-dim">
              {user?.email}
            </span>
            <button type="button" className="btn" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowLogin(true)}
          >
            Log in
          </button>
        )}
      </div>

      {showLogin && !token && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="relative w-[360px] max-w-[calc(100vw-32px)] rounded-card border border-edge bg-panel p-6 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <LoginForm onClose={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
