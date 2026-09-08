/**
 * Sync endpoint: one blob per sync code, holding that person's whole library.
 *
 * The code is the only credential, which is why it is long, random, and
 * hashed before it ever reaches a path — a leaked listing of the store must
 * not hand anyone a working code.
 *
 * Blobs are written **private**, so the library is never fetchable by URL even
 * if someone learns the path; reads go back through the SDK with the store's
 * own token. Storage is Vercel Blob, and with no store connected the route
 * reports itself unconfigured so the app stays device-local rather than
 * failing oddly.
 */
import { createHash } from "node:crypto";

import { del, get, put } from "@vercel/blob";

export const runtime = "nodejs";
// Sync must never be served from a cache — a stale pull would resurrect
// deleted jobs on the other device.
export const dynamic = "force-dynamic";

/**
 * Find the store's token.
 *
 * Connecting a Blob store normally sets `BLOB_READ_WRITE_TOKEN`, but Vercel
 * lets you choose a prefix when connecting, which names it
 * `<PREFIX>_BLOB_READ_WRITE_TOKEN` instead. Accepting either means a store
 * connected with a prefix does not silently look like no store at all.
 */
function blobToken(): string | undefined {
  const direct = process.env.BLOB_READ_WRITE_TOKEN;
  if (direct) return direct;
  const prefixed = Object.keys(process.env).find((key) =>
    key.endsWith("BLOB_READ_WRITE_TOKEN"),
  );
  return prefixed ? process.env[prefixed] : undefined;
}

/**
 * When there is no token, say which storage-related variable names the
 * deployment can see. Names only, never values — and only on the response
 * that already means "nothing is set up here", so it cannot leak once sync
 * is working.
 */
function unconfigured() {
  const seen = Object.keys(process.env)
    .filter((key) => /BLOB|STORE/i.test(key))
    .sort();
  return json({ error: "unconfigured", seen }, 501);
}

/** Roughly 4000 jobs' worth. Anything larger is a bug, not a take-off. */
const MAX_BYTES = 4_000_000;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const normalise = (code: string) => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** The blob path never contains the code itself, only a hash of it. */
function pathFor(code: string): string {
  return `libraries/${createHash("sha256").update(`kerf:${code}`).digest("hex")}.json`;
}

function readCode(request: Request): string | null {
  const code = normalise(new URL(request.url).searchParams.get("code") ?? "");
  return /^[a-z0-9]{12,64}$/.test(code) ? code : null;
}

export async function GET(request: Request) {
  const token = blobToken();
  if (!token) return unconfigured();

  const code = readCode(request);
  if (!code) return json({ error: "bad-code" }, 400);

  try {
    // useCache:false — the other device may have pushed seconds ago, and a
    // cached read here would quietly undo its work on the next merge.
    const found = await get(pathFor(code), { access: "private", useCache: false, token });
    if (!found) return json({ error: "empty" }, 404);

    const envelope = await new Response(found.stream).json();
    return json({ envelope, updatedAt: found.blob?.uploadedAt ?? null });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

export async function PUT(request: Request) {
  const token = blobToken();
  if (!token) return unconfigured();

  const code = readCode(request);
  if (!code) return json({ error: "bad-code" }, 400);

  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ error: "too-large" }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ error: "bad-body" }, 400);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { format?: string }).format !== "kerf.library"
  ) {
    return json({ error: "bad-body" }, 400);
  }

  try {
    // Overwriting in place keeps exactly one blob per code, so the store
    // cannot grow without bound as the library is pushed over and over.
    await put(pathFor(code), body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      token,
    });
    return json({ ok: true, updatedAt: new Date().toISOString(), size: body.length });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

export async function DELETE(request: Request) {
  const token = blobToken();
  if (!token) return unconfigured();

  const code = readCode(request);
  if (!code) return json({ error: "bad-code" }, 400);

  try {
    await del(pathFor(code), { token });
    return json({ ok: true });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

/** Lets the app show "sync is available" without needing a code first. */
export async function HEAD() {
  return new Response(null, { status: blobToken() ? 204 : 501 });
}
