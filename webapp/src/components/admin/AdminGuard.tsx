'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { LoginForm } from '@/lib/auth/LoginForm';

/**
 * Client-side gate for the admin console. This is UX, not security — every
 * actual write is enforced at the gateway (admin JWT claim), and the presign
 * route re-verifies against the accounts service. This just keeps non-admins
 * from staring at forms that would all 403.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();

  if (loading || (token && !user)) {
    return <p className="text-fg-dim">Checking session…</p>;
  }

  if (!token) {
    return (
      <div className="panel max-w-[380px]">
        <div className="panel-title">Admin login</div>
        <LoginForm />
      </div>
    );
  }

  if (!user?.admin) {
    return (
      <div className="panel">
        <p className="text-sm text-danger">
          This account ({user?.email}) is not an admin.
        </p>
        <p className="text-sm text-fg-dim">
          Grant it on the accounts service (<code>bin/rails
          accounts:grant_admin EMAIL=…</code>), then log out and back in — the
          admin claim is baked into the token at login.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
