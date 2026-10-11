import "server-only";
import { neon } from "@neondatabase/serverless";
import { getAuthorizedFamilyUser } from "../auth/authorization";
import { normalizeHuckleberry, type HuckleberryDashboard } from "./huckleberry-view";

export async function getHuckleberryDashboard(): Promise<HuckleberryDashboard> {
  if (!(await getAuthorizedFamilyUser())) throw new Error("Family authorization required");
  if (!process.env.DATABASE_URL) return {state:"unavailable"};
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT synced_at, payload FROM integration_snapshots WHERE provider='huckleberry' LIMIT 1`;
    if (!rows.length) return {state:"empty"};
    const synced = new Date(rows[0].synced_at);
    if (!Number.isFinite(synced.getTime()) || rows[0].payload?.source !== "huckleberry") return {state:"unavailable"};
    return {state:"ready", syncedAt:synced.toISOString(),
      stale:Date.now() - synced.getTime() > 60 * 60 * 1000, data:normalizeHuckleberry(rows[0].payload)};
  } catch {
    return {state:"unavailable"};
  }
}

export async function getHuckleberryStatus(): Promise<{ connected: boolean; syncedAt?: string }> {
  if (!(await getAuthorizedFamilyUser())) throw new Error("Family authorization required");
  if (!process.env.DATABASE_URL) return {connected:false};
  const sql = neon(process.env.DATABASE_URL);
  try {
    const rows = await sql`SELECT synced_at FROM integration_snapshots WHERE provider='huckleberry' LIMIT 1`;
    if (!rows.length) return {connected:false};
    return {connected:true,syncedAt:new Date(rows[0].synced_at).toISOString()};
  } catch {
    return {connected:false};
  }
}
