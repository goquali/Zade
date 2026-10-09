import "server-only";
import { auth } from "./server";

function approvedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Must be called server-side before reading or changing any private family data. */
export async function getAuthorizedFamilyUser() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user?.email) return null;
  return approvedEmails().has(user.email.trim().toLowerCase()) ? user : null;
}
