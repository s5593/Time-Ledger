// hooks/usePlan.ts
"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import type { PlanDoc } from "../../lib/types";

export function usePlan(date: string) {
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setPlan(null);
      setLoading(false);
      setError("Not authenticated");
      return;
    }

    setLoading(true);
    setError("");

    const ref = doc(db, "users", uid, "days", date, "plan", "main");

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPlan(snap.exists() ? (snap.data() as PlanDoc) : null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [date]);

  return { plan, loading, error };
}
