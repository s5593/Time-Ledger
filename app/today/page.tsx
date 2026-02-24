// app/today/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

// firebase.ts 경로에 맞게 수정
// - firebase.ts가 루트/lib/firebase.ts면: "../../lib/firebase"
// - firebase.ts가 src/lib/firebase.ts면: "../../src/lib/firebase"
import { auth, db } from "../../lib/firebase";

type Mood = "great" | "good" | "neutral" | "bad" | "awful";
type Category =
  | "dev"
  | "work"
  | "study"
  | "exercise"
  | "rest"
  | "family"
  | "faith"
  | "social"
  | "other";

type TodayEntry = {
  id: string;
  text: string;
  minutes: number; // 0 이상
  category: Category;
  success: boolean; // 계획 대비 성공/실패
  mood: Mood;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "dev", label: "개발" },
  { value: "work", label: "업무" },
  { value: "study", label: "공부" },
  { value: "exercise", label: "운동" },
  { value: "rest", label: "휴식" },
  { value: "family", label: "가족" },
  { value: "faith", label: "신앙" },
  { value: "social", label: "관계" },
  { value: "other", label: "기타" },
];

const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: "great", label: "최고" },
  { value: "good", label: "좋음" },
  { value: "neutral", label: "보통" },
  { value: "bad", label: "나쁨" },
  { value: "awful", label: "최악" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYmd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.trunc(v) : 0;
  return Math.min(max, Math.max(min, n));
}

/**
 * Firestore 구조 (MVP)
 * users/{uid}/days/{YYYY-MM-DD}/entries/{autoId}
 */
function entriesCol(uid: string, ymd: string) {
  return collection(db, "users", uid, "days", ymd, "entries");
}

function entryDoc(uid: string, ymd: string, entryId: string) {
  return doc(db, "users", uid, "days", ymd, "entries", entryId);
}

export default function TodayPage() {
  const router = useRouter();
  const todayYmd = useMemo(() => toYmd(new Date()), []);

  // auth
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // loading / error
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // list
  const [entries, setEntries] = useState<TodayEntry[]>([]);

  // create form
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState<string>("25");
  const [category, setCategory] = useState<Category>("dev");
  const [success, setSuccess] = useState<boolean>(true);
  const [mood, setMood] = useState<Mood>("neutral");

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingMinutes, setEditingMinutes] = useState<string>("0");
  const [editingCategory, setEditingCategory] = useState<Category>("other");
  const [editingSuccess, setEditingSuccess] = useState<boolean>(true);
  const [editingMood, setEditingMood] = useState<Mood>("neutral");

  // 1) 인증 가드 (핵심: authReady 이전에는 redirect 금지)
  useEffect(() => {
    setLoadingAuth(true);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
      setLoadingAuth(false);

      if (!u) {
        router.replace(`/login?next=/today`);
      }
    });

    return () => unsub();
  }, [router]);

  // 2) 로그인된 경우에만 entries 구독
  useEffect(() => {
    if (!authReady) return;
    if (!user) return;

    setLoadingList(true);
    setErrorText(null);

    const q = query(entriesCol(user.uid, todayYmd), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: TodayEntry[] = snap.docs.map((d) => {
          const data = d.data() as any;

          const rawMinutes = typeof data.minutes === "number" ? data.minutes : 0;
          const rawCategory = typeof data.category === "string" ? data.category : "other";
          const rawMood = typeof data.mood === "string" ? data.mood : "neutral";
          const rawSuccess = typeof data.success === "boolean" ? data.success : true;

          // 안전한 기본값 보정
          const safeMinutes = clampInt(rawMinutes, 0, 1440);
          const safeCategory = (CATEGORY_OPTIONS.some((x) => x.value === rawCategory)
            ? rawCategory
            : "other") as Category;
          const safeMood = (MOOD_OPTIONS.some((x) => x.value === rawMood) ? rawMood : "neutral") as Mood;

          return {
            id: d.id,
            text: String(data.text ?? ""),
            minutes: safeMinutes,
            category: safeCategory,
            success: rawSuccess,
            mood: safeMood,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        setEntries(list);
        setLoadingList(false);
      },
      (err) => {
        console.error("[today] onSnapshot error:", err);
        setErrorText(err?.message ?? "Failed to load entries.");
        setLoadingList(false);
      }
    );

    return () => unsub();
  }, [authReady, user, todayYmd]);

  // 3) 추가
  const addEntry = async () => {
    if (!user) return;

    const vText = text.trim();
    if (!vText) {
      setErrorText("내용(text)은 비어있을 수 없습니다.");
      return;
    }

    const vMinutes = clampInt(Number(minutes), 0, 1440);

    setErrorText(null);

    try {
      await addDoc(entriesCol(user.uid, todayYmd), {
        text: vText,
        minutes: vMinutes,
        category,
        success,
        mood,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 입력값 일부만 초기화
      setText("");
      setMinutes("25");
      setCategory("dev");
      setSuccess(true);
      setMood("neutral");
    } catch (err: any) {
      console.error("[today] addEntry error:", err);
      setErrorText(err?.message ?? "Failed to add.");
    }
  };

  // 4) 수정 시작
  const startEdit = (e: TodayEntry) => {
    setEditingId(e.id);
    setEditingText(e.text);
    setEditingMinutes(String(e.minutes ?? 0));
    setEditingCategory(e.category ?? "other");
    setEditingSuccess(Boolean(e.success));
    setEditingMood(e.mood ?? "neutral");
  };

  // 5) 수정 취소
  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
    setEditingMinutes("0");
    setEditingCategory("other");
    setEditingSuccess(true);
    setEditingMood("neutral");
  };

  // 6) 수정 저장
  const saveEdit = async () => {
    if (!user) return;
    if (!editingId) return;

    const vText = editingText.trim();
    if (!vText) {
      setErrorText("내용(text)은 비어있을 수 없습니다.");
      return;
    }

    const vMinutes = clampInt(Number(editingMinutes), 0, 1440);

    setErrorText(null);

    try {
      await updateDoc(entryDoc(user.uid, todayYmd, editingId), {
        text: vText,
        minutes: vMinutes,
        category: editingCategory,
        success: editingSuccess,
        mood: editingMood,
        updatedAt: new Date(),
      });

      cancelEdit();
    } catch (err: any) {
      console.error("[today] saveEdit error:", err);
      setErrorText(err?.message ?? "Failed to update.");
    }
  };

  // 7) 삭제
  const removeEntry = async (id: string) => {
    if (!user) return;

    setErrorText(null);

    try {
      await deleteDoc(entryDoc(user.uid, todayYmd, id));
    } catch (err: any) {
      console.error("[today] removeEntry error:", err);
      setErrorText(err?.message ?? "Failed to delete.");
    }
  };

  // 8) 간단 집계(오늘 합계/성공률) — DailyReview 만들 때 그대로 활용 가능
  const summary = useMemo(() => {
    const totalMinutes = entries.reduce((acc, e) => acc + (e.minutes ?? 0), 0);
    const successCount = entries.reduce((acc, e) => acc + (e.success ? 1 : 0), 0);
    const totalCount = entries.length;

    const byCategory: Record<string, number> = {};
    for (const e of entries) {
      const key = e.category ?? "other";
      byCategory[key] = (byCategory[key] ?? 0) + (e.minutes ?? 0);
    }

    return {
      totalMinutes,
      totalCount,
      successCount,
      byCategory,
    };
  }, [entries]);

  // 렌더링
  if (loadingAuth || !authReady) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Today</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>Auth checking...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Today</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>Redirecting to login...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Today</h1>
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            {todayYmd} · {user.email ?? user.uid}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            onClick={() => router.replace("/plan")}
          >
            Plan
          </Button>
          <Button 
            onClick={() => router.replace("/daily-review")}
          >
            Daily Review
          </Button>
        </div>
      </header>

      {/* Summary */}
      <section style={{ marginTop: 14 }}>
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            총 시간: <b>{summary.totalMinutes}</b>분
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            성공: <b>{summary.successCount}</b> / {summary.totalCount}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            카테고리:
            {" "}
            {Object.entries(summary.byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([k, v]) => {
                const label = CATEGORY_OPTIONS.find((x) => x.value === k)?.label ?? "기타";
                return `${label} ${v}분`;
              })
              .join(" · ") || "없음"}
          </div>
        </div>
      </section>

      {/* Create */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Add entry</h2>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="오늘 한 일 / 할 일 요약"
            className="tl-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
          />

          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
            placeholder="minutes"
            className="tl-input"
          />
        </div>

        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px", gap: 8 }}>
          <select className="tl-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select className="tl-select"
            value={mood}
            onChange={(e) => setMood(e.target.value as Mood)}
          >
            {MOOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "12px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.16)",
              userSelect: "none",
            }}
          >
            <input type="checkbox" checked={success} onChange={(e) => setSuccess(e.target.checked)} />
            성공
          </label>

          <Button 
            onClick={addEntry}
          >
            Add
          </Button>
        </div>

        {errorText && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,0,0,0.35)",
              background: "rgba(255,0,0,0.06)",
              whiteSpace: "pre-wrap",
            }}
          >
            {errorText}
          </div>
        )}
      </section>

      {/* List */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Entries</h2>

        {loadingList ? (
          <p style={{ opacity: 0.8, marginTop: 10 }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ opacity: 0.8, marginTop: 10 }}>No entries yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((e) => {
              const categoryLabel = CATEGORY_OPTIONS.find((x) => x.value === e.category)?.label ?? "기타";
              const moodLabel = MOOD_OPTIONS.find((x) => x.value === e.mood)?.label ?? "보통";

              return (
                <li key={e.id} style={{ border: "1px solid rgba(255, 255, 255, 0.28)", borderRadius: 12, padding: 12 }}>
                  {editingId === e.id ? (
                    <>
                      <textarea
                        value={editingText}
                        onChange={(ev) => setEditingText(ev.target.value)}
                        className="tl-textarea"
                      />

                      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "140px 1fr 1fr 1fr", gap: 8 }}>
                        <input
                          value={editingMinutes}
                          onChange={(ev) => setEditingMinutes(ev.target.value)}
                          inputMode="numeric"
                          className="tl-input"
                        />

                        <select
                          value={editingCategory}
                          onChange={(ev) => setEditingCategory(ev.target.value as Category)}
                          className="tl-select"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editingMood}
                          onChange={(ev) => setEditingMood(ev.target.value as Mood)}
                          className="tl-select"
                        >
                          {MOOD_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <label
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            padding: "12px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255, 255, 255, 0.28)",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={editingSuccess}
                            onChange={(ev) => setEditingSuccess(ev.target.checked)}
                          />
                          성공
                        </label>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <Button 
                          onClick={saveEdit}
                        >
                          Save
                        </Button >
                        <Button 
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                        <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{e.text}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {e.minutes}분 · {categoryLabel} · {moodLabel} · {e.success ? "성공" : "실패"}
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <Button 
                          onClick={() => startEdit(e)}
                        >
                          Edit
                        </Button>
                        <Button 
                          onClick={() => removeEntry(e.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
