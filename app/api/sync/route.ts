/**
 * Sync endpoint: one blob per sync code, holding that person's whole library.
 *
 * The code is the only credential, which is why it is long, random and
 * hashed before it ever touches a file name — a leaked listing of the store
 * must not hand anyone a working code.
 *
 * Storage is Vercel Blob. With no store connected the route reports itself as
 * unconfigured and the app stays device-local rather than failing oddly.
 */
import { createHash } from "node:crypto";

import { del, head, list, put } from "@vercel/blob";

export const runtime = "nodejs";
// Sync must never be served from a cache — a stale pull would resurrect
// deleted jobs on the other device.
export const dynamic = "force-dynamic";

const CONFIGURED = !!process.env.BLOB_READ_WRITE_TOKEN;
/** Roughly 4000 jobs' worth. Anything larger is a bug, not a take-off. */
const MAX_BYTES = 4_000_000;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const normalise = (code: string) => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** The blob path never contains the code itself, only a hash of it. */
function pathFor(code: string): string {
  const digest = createHash("sha256").update(`kerf:${code}`).digest("hex");
    return `libraries/${digest}.json`;
}

function readCode(request: Request): string | null {
  const code = normalise(new URL(request.url).searchParams.get("code") ?? "");
  return /^[a-z0-9]{12,64}$/.test(code) ? code : null;
}

export async function GET(request: Request) {
  if (!CONFIGURED) return json({ error: "unconfigured" }, 501);

  const code = readCode(request);
  if (!code) return json({ error: "bad-code" }, 400);

  const path = pathFor(code);
  try {
    // `head` needs the full URL, so find the blob by its prefix first.
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs.find((entry) => entry.pathname === path);
    if (!blob) return json({ error: "empty" }, 404);

    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) return json({ error: "empty" }, 404);

    return json({ envelope: await response.json(), updatedAt: blob.uploadedAt });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

export async function PUT(request: Request) {
  if (!CONFIGURED) return json({ error: "unconfigured" }, 501);

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
  if (!parsed || typeof parsed !== "object" || (parsed as { format?: string }).format !== "kerf.library") {
    return json({ error: "bad-body" }, 400);
  }

  const path = pathFor(code);
  try {
    // Overwriting keeps exactly one blob per code, so the store cannot grow
    // without bound as the library is pushed over and over.
    const blob = await put(path, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return json({ ok: true, updatedAt: new Date().toISOString(), size: body.length, url: blob.url });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

export async function DELETE(request: Request) {
  if (!CONFIGURED) return json({ error: "unconfigured" }, 501);

  const code = readCode(request);
  if (!code) return json({ error: "bad-code" }, 400);

  try {
    const found = await list({ prefix: pathFor(code), limit: 1 });
    const blob = found.blobs.find((entry) => entry.pathname === pathFor(code));
    if (blob) await del(blob.url);
    return json({ ok: true });
  } catch {
    return json({ error: "unavailable" }, 502);
  }
}

/** Lets the app show "sync is available" without needing a code first. */
export async function HEAD() {
  return new Response(null, { status: CONFIGURED ? 204 : 501 });
}

// `head` is imported for its types only in some builds; reference it so the
// import cannot be dropped and then re-added by a later edit.
void head;
