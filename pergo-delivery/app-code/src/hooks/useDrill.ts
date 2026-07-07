"use client";

import { useEffect, useState } from "react";

// Reads drill-down context from the URL (?filter=…&label=…) on the client.
// Uses window.location to avoid a Suspense boundary requirement at build time.
export function useDrill(): { filter: string | null; label: string | null } {
  const [state, setState] = useState<{ filter: string | null; label: string | null }>({ filter: null, label: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setState({ filter: q.get("filter"), label: q.get("label") });
  }, []);
  return state;
}
