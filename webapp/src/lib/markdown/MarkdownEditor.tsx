'use client';

import { useRef, useState } from 'react';
import { presignUpload, uploadToPresignedUrl } from '../api/admin';
import { resolveAssetUrl } from '../icons';
import { MarkerBody } from './MarkerBody';

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Surfaced upload/config errors (shared with the host form's error line). */
  onError?: (msg: string | null) => void;
  placeholder?: string;
  rows?: number;
  /** Other markers on the map, for the "link a marker" picker. */
  markers?: { id: number; title: string | null }[];
}

type Uploading = 'image' | 'video' | null;

/**
 * Markdown source editor for marker descriptions: a textarea plus image/video
 * upload (to the public bucket via presign), a "link another marker" picker,
 * and a live preview rendered with the same {@link MarkerBody} used on the site.
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  onError,
  placeholder = 'description (Markdown) — **bold**, ![](image), or paste a YouTube/Vimeo link',
  rows = 5,
  markers,
}) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState<Uploading>(null);
  const [preview, setPreview] = useState(false);

  // Insert at the caret (or append), then restore the caret after the snippet.
  const insert = (snippet: string) => {
    const ta = taRef.current;
    if (!ta) {
      onChange(value + snippet);
      return;
    }
    const { selectionStart: s, selectionEnd: e } = ta;
    onChange(value.slice(0, s) + snippet + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + snippet.length;
    });
  };

  const onUpload = async (file: File | undefined, kind: 'image' | 'video') => {
    if (!file) return;
    onError?.(null);
    setUploading(kind);
    try {
      const grant = await presignUpload(file.name, 'tiles');
      await uploadToPresignedUrl(grant.url, file);
      const url = resolveAssetUrl(grant.key);
      if (!url) {
        onError?.(
          'Uploaded, but NEXT_PUBLIC_ASSET_BASE_URL is unset — set it to the public bucket base so media resolves to a URL.',
        );
        return;
      }
      // Image → markdown image; video → bare URL on its own line (auto-embeds).
      insert(kind === 'image' ? `\n![](${url})\n` : `\n${url}\n`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'media upload failed');
    } finally {
      setUploading(null);
    }
  };

  const markerTitle = (id: number): string | null =>
    markers?.find((m) => m.id === id)?.title ?? null;

  const linkMarker = (idStr: string) => {
    if (idStr === '') return;
    const id = Number(idStr);
    const label = markerTitle(id)?.trim() || `Marker #${id}`;
    insert(`[${label}](#marker-${id})`);
  };

  return (
    <div className="rm-md-editor">
      <div className="rm-md-toolbar">
        <label className="rm-btn rm-btn-sm">
          {uploading === 'image' ? 'Uploading…' : 'Image'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={uploading !== null}
            onChange={(e) => onUpload(e.target.files?.[0], 'image')}
          />
        </label>
        <label className="rm-btn rm-btn-sm">
          {uploading === 'video' ? 'Uploading…' : 'Video'}
          <input
            type="file"
            accept="video/*"
            hidden
            disabled={uploading !== null}
            onChange={(e) => onUpload(e.target.files?.[0], 'video')}
          />
        </label>
        {markers && markers.length > 0 && (
          <select
            className="rm-select rm-md-marker-select"
            value=""
            onChange={(e) => linkMarker(e.target.value)}
            title="Insert a link to another marker"
          >
            <option value="">Link marker…</option>
            {markers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title ?? `Marker #${m.id}`}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={`rm-btn rm-btn-sm${preview ? ' rm-btn-active' : ''}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div className="rm-md-preview">
          {value.trim() === '' ? (
            <span className="rm-empty">Nothing to preview.</span>
          ) : (
            <MarkerBody markdown={value} resolveMarkerLabel={markerTitle} />
          )}
        </div>
      ) : (
        <textarea
          ref={taRef}
          className="rm-input rm-md-textarea"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};
