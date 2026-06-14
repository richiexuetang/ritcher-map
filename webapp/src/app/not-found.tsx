import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 flex flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-bold">Nothing here</h1>
        <p className="text-sm text-fg-dim">
          That game or map does not exist (or is not published yet).
        </p>
        <Link className="btn btn-primary" href="/">
          All games
        </Link>
      </main>
    </div>
  );
}
