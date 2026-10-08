import { auth } from "./lib/auth/server";

// Complete OAuth callbacks and validate sessions before protected routes.
export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
