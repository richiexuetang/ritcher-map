'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  createGame,
  deleteGame,
  presignUpload,
  updateGame,
  uploadToPresignedUrl,
  type GameInput,
} from '@/lib/api/admin';
import { listGames } from '@/lib/api/games';
import { resolveAssetUrl } from '@/lib/icons';
import type { GameResponse } from '@/lib/types';

type Form = { slug: string } & Record<keyof GameInput, string>;

const EMPTY: Form = {
  slug: '',
  title: '',
  primaryColor: '',
  accentColor: '',
  fontFamily: '',
  fontUrl: '',
  logoUrl: '',
  thumbnailUrl: '',
};

function nullable(s: string): string | null {
  return s.trim() === '' ? null : s.trim();
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameResponse[]>([]);
  // null = no form open; '' = creating; otherwise the slug being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'logoUrl' | 'thumbnailUrl' | null>(
    null,
  );

  const reload = () => listGames().then(setGames).catch(() => setGames([]));
  useEffect(() => {
    reload();
  }, []);

  const startNew = () => {
    setEditing('');
    setForm(EMPTY);
    setError(null);
  };
  const startEdit = (g: GameResponse) => {
    setEditing(g.slug);
    setError(null);
    setForm({
      slug: g.slug,
      title: g.title,
      primaryColor: g.primaryColor ?? '',
      accentColor: g.accentColor ?? '',
      fontFamily: g.fontFamily ?? '',
      fontUrl: g.fontUrl ?? '',
      logoUrl: g.logoUrl ?? '',
      thumbnailUrl: g.thumbnailUrl ?? '',
    });
  };

  const set =
    (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (
    file: File | undefined,
    field: 'logoUrl' | 'thumbnailUrl',
  ) => {
    if (!file) return;
    setUploading(field);
    setError(null);
    try {
      const grant = await presignUpload(file.name, 'tiles');
      await uploadToPresignedUrl(grant.url, file);
      const url = resolveAssetUrl(grant.key);
      setForm((f) => ({ ...f, [field]: url ?? grant.key }));
      if (!url) {
        setError(
          'Uploaded, but NEXT_PUBLIC_ASSET_BASE_URL is unset — paste a public URL instead.',
        );
      }
    } catch (e) {
      setError(errMsg(e, 'upload failed'));
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input: GameInput = {
      title: form.title.trim(),
      primaryColor: nullable(form.primaryColor),
      accentColor: nullable(form.accentColor),
      fontFamily: nullable(form.fontFamily),
      fontUrl: nullable(form.fontUrl),
      logoUrl: nullable(form.logoUrl),
      thumbnailUrl: nullable(form.thumbnailUrl),
    };
    try {
      if (editing === '') await createGame(form.slug.trim(), input);
      else if (editing) await updateGame(editing, input);
      setEditing(null);
      reload();
    } catch (err) {
      setError(errMsg(err, 'save failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: GameResponse) => {
    if (!window.confirm(`Delete branding for "${g.title}" (${g.slug})?`)) return;
    try {
      await deleteGame(g.slug);
      if (editing === g.slug) setEditing(null);
      reload();
    } catch (e) {
      setError(errMsg(e, 'delete failed'));
    }
  };

  const previewStyle: CSSProperties = {
    '--color-brand': form.primaryColor || '#3b82f6',
    '--color-accent': form.accentColor || '#3b82f6',
  } as CSSProperties;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Games &amp; branding</h1>
        <button type="button" className="btn btn-primary" onClick={startNew}>
          New game
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="panel mb-4">
        <div className="panel-title">Games</div>
        {games.length === 0 ? (
          <p className="text-sm text-fg-dim">
            No branded games yet — add one. The slug must match the maps&apos;
            <code> gameSlug</code>.
          </p>
        ) : (
          <table className="w-full text-sm [&_td]:border-t [&_td]:border-edge [&_td]:py-1.5 [&_td]:align-middle [&_tr:first-child_td]:border-t-0">
            <tbody>
              {games.map((g) => {
                const logo = resolveAssetUrl(g.logoUrl);
                return (
                  <tr key={g.slug}>
                    <td className="w-9">
                      <span
                        className="swatch"
                        style={{ background: g.primaryColor ?? '#9aa0a6' }}
                      />
                    </td>
                    <td className="w-12">
                      {logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logo}
                          alt=""
                          className="h-6 w-auto max-w-10 object-contain"
                        />
                      )}
                    </td>
                    <td>{g.title}</td>
                    <td className="text-[13px] text-fg-dim">{g.slug}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => startEdit(g)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => remove(g)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <form onSubmit={submit} className="panel max-w-2xl">
          <div className="panel-title">
            {editing === '' ? 'New game' : `Edit "${form.title || editing}"`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1"
              placeholder="slug (matches gameSlug, e.g. elden-ring)"
              value={form.slug}
              onChange={set('slug')}
              required
              disabled={editing !== ''}
            />
            <input
              className="input flex-1"
              placeholder="display title"
              value={form.title}
              onChange={set('title')}
              required
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-fg-dim">
              Primary
              <input
                type="color"
                className="h-8 w-10 cursor-pointer rounded border border-edge bg-transparent"
                value={form.primaryColor || '#3b82f6'}
                onChange={set('primaryColor')}
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-fg-dim">
              Accent
              <input
                type="color"
                className="h-8 w-10 cursor-pointer rounded border border-edge bg-transparent"
                value={form.accentColor || '#3b82f6'}
                onChange={set('accentColor')}
              />
            </label>
          </div>

          <input
            className="input"
            placeholder="font family (CSS name, e.g. 'Cinzel', serif)"
            value={form.fontFamily}
            onChange={set('fontFamily')}
          />
          <input
            className="input"
            placeholder="font stylesheet URL (e.g. Google Fonts href)"
            value={form.fontUrl}
            onChange={set('fontUrl')}
          />

          {(['logoUrl', 'thumbnailUrl'] as const).map((field) => (
            <div key={field} className="flex flex-wrap items-center gap-2">
              <input
                className="input flex-1"
                placeholder={
                  field === 'logoUrl' ? 'logo URL / key' : 'thumbnail URL / key'
                }
                value={form[field]}
                onChange={set(field)}
              />
              <label className="btn btn-sm">
                {uploading === field ? 'Uploading…' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading !== null}
                  onChange={(e) => upload(e.target.files?.[0], field)}
                />
              </label>
            </div>
          ))}

          {/* Live brand preview */}
          <div
            className="flex items-center gap-3 rounded-card border border-edge p-3"
            style={previewStyle}
          >
            <span
              className="font-bold"
              style={form.fontFamily ? { fontFamily: form.fontFamily } : undefined}
            >
              {form.title || 'Preview'}
            </span>
            <span className="badge" style={{ background: 'var(--color-brand)', color: '#fff' }}>
              brand
            </span>
            <span className="btn btn-primary btn-sm pointer-events-none">accent</span>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing === '' ? 'Create' : 'Save'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}
