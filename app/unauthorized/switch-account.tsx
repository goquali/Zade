"use client";

import { createAuthClient } from "@neondatabase/auth/next";

const authClient = createAuthClient();

export default function SwitchAccount() {
  async function switchAccount() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }
  return <button type="button" onClick={switchAccount} style={{padding:"12px 20px",borderRadius:10,cursor:"pointer"}}>
    Sign out and switch Google account
  </button>;
}
