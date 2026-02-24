// app/plan/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/Button";

import { auth, db } from "../../lib/firebase";

type PlanItem = {
  text: string;
  done: boolean;
};

type PlanDoc = {
  top3: PlanItem[];
  note: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function planDocRef(uid: string, ymd: string) {
  return doc(db, "users", uid, "days", ymd, "plan", "main");
}

function normalizeTop3(items: PlanItem[]): PlanItem[] {
  const base = Array.isArray(items) ? items.slice(0, 3) : [];
  while (base.length < 3) base.push({ text: "", done: false });

  return base.map((x) => ({
    text: String(x?.text ?? "").slice(0, 200),
    done: Boolean(x?.done),
  }));
}

export default function PlanPage() {
  const router = useRouter();
  const todayYmd = useMemo(() => toYmd(new Date()), []);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [loadingDoc, setLoadingDoc] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [top3, setTop3] = useState<PlanItem[]>([
    { text: "", done: false },
    { text: "", done: false },
    { text: "", done: false },
  ]);

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 🔹 인증 가드
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
      if (!u) router.replace(`/login?next=/plan`);
    });
    return () => unsub();
  }, [router]);

  // 🔹 문서 구독
  useEffect(() => {
    if (!authReady || !user) return;

    setLoadingDoc(true);
    setErrorText(null);

    const ref = planDocRef(user.uid, todayYmd);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setTop3(normalizeTop3([]));
          setNote("");
          setLoadingDoc(false);
          return;
        }

        const data = snap.data() as PlanDoc;

        setTop3(normalizeTop3(data.top3 ?? []));
        setNote(String(data.note ?? ""));
        setLoadingDoc(false);

        if (data.updatedAt instanceof Date) {
          setLastSavedAt(data.updatedAt.toLocaleTimeString());
        } else if ((data.updatedAt as any)?.toDate) {
          // 혹시 Timestamp로 들어오는 경우 대비
          setLastSavedAt((data.updatedAt as any).toDate().toLocaleTimeString());
        }
      },
      (err) => {
        console.error("[plan] load error:", err);
        setErrorText(err?.message ?? "Failed to load.");
        setLoadingDoc(false);
      }
    );

    return () => unsub();
  }, [authReady, user, todayYmd]);

  // 🔹 저장
  const savePlan = async () => {
    if (!user) return;

    setSaving(true);
    setErrorText(null);

    try {
      const ref = planDocRef(user.uid, todayYmd);

      const now = new Date();

      const payload: PlanDoc = {
        top3: normalizeTop3(top3),
        note: String(note ?? "").slice(0, 2000),
        updatedAt: now,
        createdAt: now,
      };

      await setDoc(ref, payload, { merge: true });

      setLastSavedAt(now.toLocaleTimeString());
    } catch (err: any) {
      console.error("[plan] save error:", err);
      setErrorText(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (!authReady) {
    return <main style={{ padding: 24 }}>Loading...</main>;
  }

  if (!user) {
    return <main style={{ padding: 24 }}>Redirecting...</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Plan</h1>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {todayYmd} · {user.email ?? user.uid}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => router.replace("/today")}>Today</Button>
          <Button onClick={() => router.replace("/daily-review")}>Daily Review</Button>
        </div>
      </header>

      <section style={{ marginTop: 20 }}>
        <h2>Top 3</h2>

        {loadingDoc ? (
          <p>Loading...</p>
        ) : (
          top3.map((item, idx) => (
            <div key={idx} style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  setTop3((prev) =>
                    prev.map((p, i) =>
                      i === idx ? { ...p, done: !p.done } : p
                    )
                  )
                }
              />
              <input
                className="tl-input"
                value={item.text}
                onChange={(e) =>
                  setTop3((prev) =>
                    prev.map((p, i) =>
                      i === idx ? { ...p, text: e.target.value } : p
                    )
                  )
                }
                placeholder={`목표 ${idx + 1}`}
                style={{ marginLeft: 8 }}
              />
            </div>
          ))
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Note</h2>
        <textarea
          className="tl-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", minHeight: 100 }}
        />
      </section>

      {errorText && (
        <div style={{ marginTop: 12, color: "red" }}>{errorText}</div>
      )}

      <section style={{ marginTop: 20 }}>
        <Button onClick={savePlan} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>

        <div style={{ fontSize: 12, marginTop: 6 }}>
          {lastSavedAt ? `Last saved: ${lastSavedAt}` : "Not saved yet"}
        </div>
      </section>
    </main>
  );
}
