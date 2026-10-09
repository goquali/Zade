"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { useState } from "react";

const authClient = createAuthClient();

export default function SignIn() {
  const [error, setError] = useState("");
  async function signIn() {
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) setError(result.error.message || "Google sign-in failed.");
    } catch {
      setError("Unable to start Google sign-in. Please try again.");
    }
  }
  return <main className="shell">
    <header className="header"><div><p className="eyebrow">PRIVATE FAMILY DASHBOARD</p><h1>Zade ♡</h1><p className="muted">Sign in with your approved Google account.</p></div></header>
    <section className="panel">
      <button type="button" onClick={signIn} style={{padding:"12px 20px",borderRadius:10,cursor:"pointer"}}>Continue with Google</button>
      {error && <p role="alert">{error}</p>}
      <p className="muted">Only the two approved family accounts can access Zade's dashboard.</p>
    </section>
  </main>;
}
