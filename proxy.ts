import { auth } from "./lib/auth/server";

// The machine sync route validates ZADE_SYNC_TOKEN itself. All dashboard routes
// still require a Neon session, and Vercel Deployment Protection stays enabled.
export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/integrations/huckleberry/?$).*)"],
};
