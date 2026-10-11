"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function SnapshotRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <button
    type="button"
    className="snapshot-refresh"
    title={pending ? "Refreshing saved data" : "Refresh saved data"}
    aria-label={pending ? "Refreshing saved data" : "Refresh saved data"}
    aria-busy={pending}
    disabled={pending}
    onClick={() => startTransition(() => router.refresh())}
  ><RefreshCw size={20} aria-hidden="true" /></button>;
}
