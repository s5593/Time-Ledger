// hooks/useTodayEntries.ts
"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import type { EntryDoc } from "../../lib/types";

export function useTodayEntries(date: string) {
  const [entries, setEntries] = useState<EntryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setEntries([]);
      setLoading(false);
      setError("Not authenticated");
      return;
    }

    setLoading(true);
    setError("");

    const col = collection(db, "users", uid, "days", date, "entries");
    const q = query(col, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EntryDoc[];
        setEntries(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [date]);

  return { entries, loading, error };
}
