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
    <div className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-edge">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="text-lg font-bold tracking-[0.2px] text-fg hover:text-accent">
            RitcherMap
          </Link>
          <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-[7px] py-0.5 rounded-full bg-danger/[0.18] text-[#ff9c9c]">
            admin
          </span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin">Maps</Link>
          <Link href="/admin/games">Games</Link>
          <Link href="/admin/stitch">Stitch</Link>
          <Link href="/">Site</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-6">
        <AdminGuard>{children}</AdminGuard>
      </main>
    </div>
  );
}
