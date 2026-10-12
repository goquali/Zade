import HuckleberryDashboard from "./components/huckleberry-dashboard";
import SnapshotRefresh from "./components/snapshot-refresh";
import { redirect } from "next/navigation";
import { auth } from "../lib/auth/server";
import { getAuthorizedFamilyUser } from "../lib/auth/authorization";
import { getHuckleberryDashboard } from "../lib/integrations/huckleberry";
import { Heart } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function Home() {
  const { data } = await auth.getSession();
  if (!data?.user) redirect("/sign-in");
  if (!(await getAuthorizedFamilyUser())) redirect("/unauthorized");
  const snapshot = await getHuckleberryDashboard();
  return <main className="shell">
    <header className="header"><div><p className="eyebrow">FAMILY DASHBOARD</p><h1>Zade</h1><p className="muted">Care, at a glance.</p></div><div className="header-actions"><SnapshotRefresh/><div className="avatar"><Heart size={24}/></div></div></header>
    <HuckleberryDashboard snapshot={snapshot}/>
    <section className="connections"><h2>Connections</h2><div className="connection"><span>Huckleberry</span><span>{snapshot.state === "ready" ? "Snapshot saved" : snapshot.state === "empty" ? "Waiting for sync" : "Status unavailable"}</span></div><div className="connection"><span>Nanit</span><span className="disconnected">Not connected</span></div></section>
    <footer>Private family access</footer>
  </main>;
}
