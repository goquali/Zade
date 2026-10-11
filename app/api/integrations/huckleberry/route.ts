import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
import { normalizeHuckleberry } from "../../../../lib/integrations/huckleberry-view";

export const runtime = "nodejs";
const syncHeaders = { "x-zade-auth-layer": "sync-token", "Cache-Control": "no-store" };
function equalSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function authenticate(req: NextRequest) {
  const secret = process.env.ZADE_SYNC_TOKEN;
  if (!secret || secret.length < 32 || !process.env.DATABASE_URL)
    return NextResponse.json({error:"Sync unavailable"}, {status:503, headers:syncHeaders});
  if (!equalSecret(req.headers.get("authorization") ?? "", "Bearer " + secret))
    return NextResponse.json({error:"Unauthorized"}, {status:401, headers:syncHeaders});
  return null;
}
// A successful check proves the runner and deployment tokens agree. No data or
// secret fingerprints are returned, and no database query or write is performed.
export async function GET(req: NextRequest) {
  const rejected = authenticate(req);
  if (rejected) return rejected;
  if (req.nextUrl.searchParams.get("verify") === "storage") {
    const sql = neon(process.env.DATABASE_URL!);
    try {
      const rows = await sql`SELECT synced_at, payload,
        payload->>'source' AS source,
        jsonb_typeof(payload->'sleep') AS sleep_type,
        jsonb_typeof(payload->'nursing') AS nursing_type,
        jsonb_typeof(payload->'growth') AS growth_type
        FROM integration_snapshots WHERE provider='huckleberry' LIMIT 1`;
      const row = rows[0];
      const view = row ? normalizeHuckleberry(row.payload) : null;
      return NextResponse.json({ok:true, stored:!!row,
        syncedAt:row ? new Date(row.synced_at).toISOString() : null,
        sourceVerified:row?.source === "huckleberry",
        documents:row ? {sleep:row.sleep_type, nursing:row.nursing_type, growth:row.growth_type} : null,
        displayAvailable:view ? {
          sleep:!!view.sleep.startedAt, nursing:!!view.nursing.startedAt,
          weight:!!view.growth.weight, height:!!view.growth.height, head:!!view.growth.head
        } : null
      }, {headers:syncHeaders});
    } catch {
      return NextResponse.json({error:"Storage verification unavailable"}, {status:503, headers:syncHeaders});
    }
  }
  return NextResponse.json({ok:true}, {headers:syncHeaders});
}
export async function POST(req: NextRequest) {
  const rejected = authenticate(req);
  if (rejected) return rejected;
  const database = process.env.DATABASE_URL!;
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 1000000) return NextResponse.json({error:"Payload too large"}, {status:413});
  let body: unknown;
  try { const raw = await req.text(); if (raw.length > 1000000) return NextResponse.json({error:"Payload too large"}, {status:413}); body = JSON.parse(raw); } catch { return NextResponse.json({error:"Invalid JSON"}, {status:400}); }
  if (!body || typeof body !== "object") return NextResponse.json({error:"Invalid snapshot"}, {status:400});
  const data = body as Record<string, unknown>;
  // The Python API returns null when a child has no sleep/feed document yet.
  const validDocument = (value: unknown) => value === null ||
    (typeof value === "object" && !Array.isArray(value));
  if (data.source !== "huckleberry" || typeof data.childId !== "string" || !data.childId || data.childId.length > 200 ||
      typeof data.syncedAt !== "string" || !Number.isFinite(Date.parse(data.syncedAt)) ||
      !("sleep" in data) || !("nursing" in data) ||
      !validDocument(data.sleep) || !validDocument(data.nursing))
    return NextResponse.json({error:"Invalid snapshot"}, {status:400});
  const sql = neon(database);
  await sql`CREATE TABLE IF NOT EXISTS integration_snapshots (
    provider text PRIMARY KEY,
    child_id text NOT NULL,
    synced_at timestamptz NOT NULL,
    payload jsonb NOT NULL
  )`;
  await sql`INSERT INTO integration_snapshots (provider,child_id,synced_at,payload)
    VALUES ('huckleberry',${data.childId},${data.syncedAt},${JSON.stringify(data)}::jsonb)
    ON CONFLICT (provider) DO UPDATE SET child_id=excluded.child_id,
      synced_at=excluded.synced_at, payload=excluded.payload
    WHERE integration_snapshots.synced_at <= excluded.synced_at`;
  return NextResponse.json({ok:true}, {headers:syncHeaders});
}
