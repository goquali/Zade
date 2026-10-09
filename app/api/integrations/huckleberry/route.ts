import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
function equalSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function POST(req: NextRequest) {
  const secret = process.env.ZADE_SYNC_TOKEN;
  const database = process.env.DATABASE_URL;
  if (!secret || secret.length < 32 || !database) return NextResponse.json({error:"Sync unavailable"}, {status:503});
  if (!equalSecret(req.headers.get("authorization") ?? "", "Bearer " + secret))
    return NextResponse.json({error:"Unauthorized"}, {status:401});
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 100000) return NextResponse.json({error:"Payload too large"}, {status:413});
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({error:"Invalid JSON"}, {status:400}); }
  if (!body || typeof body !== "object") return NextResponse.json({error:"Invalid snapshot"}, {status:400});
  const data = body as Record<string, unknown>;
  if (data.source !== "huckleberry" || typeof data.childId !== "string" || data.childId.length > 200 ||
      typeof data.syncedAt !== "string" || !data.sleep || !data.nursing)
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
  return NextResponse.json({ok:true});
}
