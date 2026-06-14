// Mints short-lived presigned PUT URLs so the browser can upload straight to
// R2 (no serverless body-size limit in the path). Admin-only: the caller's
// bearer token is re-verified against the accounts service — this route trusts
// /account/me, not the client.
//
// Two modes:
//   { filename }                 -> single object under uploads/<uuid>/<name>
//                                   (map source images, category icons)
//   { keys: [...], target }      -> batch; caller supplies exact keys. target
//                                   'tiles' signs against the tile bucket so a
//                                   pre-built {z}/{x}/{y} pyramid can be imported
//                                   directly to where the tile service serves it.
//
// Server env (never NEXT_PUBLIC_): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, optional R2_UPLOAD_BUCKET (default "ritcher-map") and
// R2_TILES_BUCKET (default "tiles"). The target bucket needs a CORS rule
// allowing PUT from this app's origin.

import { AwsClient } from 'aws4fetch';
import { GATEWAY_URL } from '@/lib/config';

const EXPIRES_SECONDS = '900'; // 15 min — sign, upload, done.
const MAX_BATCH_KEYS = 500; // bound work per request; client chunks larger sets.

/** Reject traversal / absolute / oddly-charactered keys before signing them. */
function safeKey(k: unknown): string | null {
  if (typeof k !== 'string') return null;
  const v = k.trim();
  if (v === '' || v.length > 1024) return null;
  if (v.startsWith('/')) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(v)) return null;
  if (v.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return null;
  }
  return v;
}

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const meRes = await fetch(`${GATEWAY_URL}/account/me`, {
    headers: { authorization: authHeader },
    cache: 'no-store',
  });
  if (!meRes.ok) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const me = (await meRes.json()) as { admin?: boolean };
  if (me.admin !== true) {
    return Response.json({ error: 'admin required' }, { status: 403 });
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const uploadBucket = process.env.R2_UPLOAD_BUCKET ?? 'ritcher-map';
  const tilesBucket = process.env.R2_TILES_BUCKET ?? 'tiles';
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return Response.json(
      { error: 'uploads not configured (set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
    keys?: unknown;
    target?: unknown;
  } | null;

  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: 'auto',
    service: 's3',
  });

  const sign = async (bucket: string, key: string): Promise<string> => {
    const target = new URL(
      `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`,
    );
    target.searchParams.set('X-Amz-Expires', EXPIRES_SECONDS);
    const signed = await r2.sign(new Request(target, { method: 'PUT' }), {
      aws: { signQuery: true },
    });
    return signed.url;
  };

  // --- batch mode: caller-supplied keys (tile-pyramid import) ---
  if (Array.isArray(body?.keys)) {
    const bucket = body?.target === 'tiles' ? tilesBucket : uploadBucket;
    if (body.keys.length === 0) {
      return Response.json({ error: 'keys[] is empty' }, { status: 400 });
    }
    if (body.keys.length > MAX_BATCH_KEYS) {
      return Response.json(
        { error: `too many keys (max ${MAX_BATCH_KEYS} per request)` },
        { status: 400 },
      );
    }
    const clean: string[] = [];
    for (const k of body.keys) {
      const safe = safeKey(k);
      if (!safe) {
        return Response.json({ error: `invalid key: ${String(k)}` }, { status: 400 });
      }
      clean.push(safe);
    }
    const urls = await Promise.all(
      clean.map(async (key) => ({ key, url: await sign(bucket, key) })),
    );
    return Response.json({ bucket, urls });
  }

  // --- single mode: generated key ---
  // 'tiles' target -> public bucket under media/ (browser-served marker media,
  // category icons); default -> private uploads bucket (tiler source images).
  const rawName = typeof body?.filename === 'string' ? body.filename : '';
  if (!rawName) {
    return Response.json({ error: 'filename or keys[] required' }, { status: 400 });
  }
  const safeName =
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'upload';
  const toTiles = body?.target === 'tiles';
  const bucket = toTiles ? tilesBucket : uploadBucket;
  const prefix = toTiles ? 'media' : 'uploads';
  const key = `${prefix}/${crypto.randomUUID()}/${safeName}`;
  const url = await sign(bucket, key);

  return Response.json({ bucket, key, url });
}
