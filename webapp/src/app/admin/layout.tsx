import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminGuard } from '@/components/admin/AdminGuard';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rm-page">
      <header className="rm-header">
        <div className="rm-header-left">
          <Link href="/" className="rm-header-brand">
            RitcherMap
          </Link>
          <span className="rm-admin-tag">admin</span>
        </div>
        <nav className="rm-admin-nav">
          <Link href="/admin">Maps</Link>
          <Link href="/admin/stitch">Stitch</Link>
          <Link href="/">Site</Link>
        </nav>
      </header>
      <main className="rm-page-main rm-admin-main">
        <AdminGuard>{children}</AdminGuard>
      </main>
    </div>
  );
}
