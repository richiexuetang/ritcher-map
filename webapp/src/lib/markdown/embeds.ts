// Recognize video URLs so the markdown renderer can upgrade a bare link into a
// player. Pure + unit-tested; no DOM. Only http(s) URLs from known hosts (or
// direct video files) ever become embeds — everything else stays a plain link.

export type VideoEmbed =
  | { kind: 'youtube'; src: string; title: string }
  | { kind: 'vimeo'; src: string; title: string }
  | { kind: 'file'; src: string };

const VIDEO_FILE_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;
const ID_RE = /^[A-Za-z0-9_-]{6,}$/;

/** Parse a URL into a video embed descriptor, or null if it isn't one. */
export function parseVideoEmbed(rawUrl: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube — watch?v=, /shorts/<id>, /embed/<id>
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const seg = url.pathname.split('/').filter(Boolean);
    let id = url.searchParams.get('v') ?? '';
    if (!id && (seg[0] === 'shorts' || seg[0] === 'embed' || seg[0] === 'v')) {
      id = seg[1] ?? '';
    }
    return ID_RE.test(id)
      ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}`, title: 'YouTube video' }
      : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return ID_RE.test(id)
      ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}`, title: 'YouTube video' }
      : null;
  }

  // Vimeo — vimeo.com/<id> or player.vimeo.com/video/<id>
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/(\d{6,})/);
    return m
      ? { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}`, title: 'Vimeo video' }
      : null;
  }

  // Direct video file (e.g. an uploaded .mp4/.webm in object storage)
  if (VIDEO_FILE_RE.test(url.pathname)) {
    return { kind: 'file', src: rawUrl };
  }
  return null;
}
