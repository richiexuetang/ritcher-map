// Mints short-lived presigned PUT URLs so the browser can upload map images
// straight to the R2 uploads bucket (no serverless body-size limit in the
// path). Admin-only: the caller's bearer token is re-verified against the
// accounts service — this route trusts /account/me, not the client.
//
// Server env (never NEXT_PUBLIC_): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, optional R2_UPLOAD_BUCKET (default "ritcher-map").
// The bucket also needs a CORS rule allowing PUT from this app's origin.

import { AwsClient } from 'aws4fetch';
import { GATEWAY_URL } from '@/lib/config';

const EXPIRES_SECONDS = '900'; // 15 min — sign, upload, done.

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
  const bucket = process.env.R2_UPLOAD_BUCKET ?? 'ritcher-map';
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return Response.json(
      { error: 'uploads not configured (set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: unknown;
  } | null;
  const rawName = typeof body?.filename === 'string' ? body.filename : '';
  if (!rawName) {
    return Response.json({ error: 'filename required' }, { status: 400 });
  }
  const safeName =
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'upload';
  const key = `uploads/${crypto.randomUUID()}/${safeName}`;

  const r2 = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: 'auto',
    service: 's3',
  });
  const target = new URL(
    `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`,
  );
  target.searchParams.set('X-Amz-Expires', EXPIRES_SECONDS);
  const signed = await r2.sign(new Request(target, { method: 'PUT' }), {
    aws: { signQuery: true },
  });

  return Response.json({ bucket, key, url: signed.url });
}
