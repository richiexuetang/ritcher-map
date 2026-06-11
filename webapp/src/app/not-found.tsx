import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="rm-page">
      <main className="rm-page-main rm-page-center">
        <h1 className="rm-page-title">Nothing here</h1>
        <p className="rm-empty">
          That game or map does not exist (or is not published yet).
        </p>
        <Link className="rm-btn rm-btn-primary" href="/">
          All games
        </Link>
      </main>
    </div>
  );
}
