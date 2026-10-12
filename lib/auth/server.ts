import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;

// Fail closed: never silently run without authentication configuration.
if (!baseUrl || !secret || secret.length < 32) {
  throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (32+ characters).");
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: { secret },
});
