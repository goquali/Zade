import "server-only";
import { neon } from "@neondatabase/serverless";

export async function getHuckleberryStatus(): Promise<{ connected: boolean; syncedAt?: string }> {
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
