"use client";

import { useCallback, useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  reload: () => void;
}

// Loads data via an async loader, exposing loading/error/reload and whether
// Supabase is configured at all (drives the setup screen).
export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = true; // local engine is always available; cloud is optional

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, configured, reload: run };
}
