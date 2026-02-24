// app/daily-review/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Button } from "@/components/ui/Button";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { getTodayKst } from "@/lib/date";
import { computeDaily, digestEntries } from "@/lib/daily";
import { deepRemoveUndefined } from "@/lib/firestoreSanitize";
import type { EntryDoc, PlanDoc, ReviewDoc, FeedbackRun } from "@/lib/types";

function byCategoryText(byCategory: Record<string, number>) {
  const items = Object.entries(byCategory ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (items.length === 0) return "-";
  return items.map(([k, v]) => `${k}: ${v}m`).join(" / ");
}

function defaultTop3(): PlanDoc["top3"] {
  return [
    { text: "", done: false },
    { text: "", done: false },
    { text: "", done: false },
  ];
}

function ensureTop3(plan: PlanDoc | null | undefined): PlanDoc["top3"] {
  const base = plan?.top3 ?? [];
  const arr = base.slice(0, 3).map((t) => ({ text: t?.text ?? "", done: !!t?.done }));
  while (arr.length < 3) arr.push({ text: "", done: false });
  return arr;
}

/**
 * /api/feedback 응답이 과거(JSON output) / 현재(text) 두 형태를 모두 지원하도록 방어적으로 파싱한다.
 * - 신버전: { text: string, meta?: ... }
 * - 구버전: { output: { summary, gaps, praise, improve, tomorrowTop3Suggestion } }
 */
function parseFeedbackResponse(raw: any): { outputText: string; output?: any } {
  // 1) 신버전 (텍스트)
  if (typeof raw?.text === "string" && raw.text.trim().length > 0) {
    return { outputText: raw.text };
  }

  // 2) 구버전 (JSON output)
  if (raw?.output && typeof raw.output === "object") {
    const o = raw.output;
    const summary = typeof o.summary === "string" ? o.summary : "";
    const gaps = Array.isArray(o.gaps) ? o.gaps.filter(Boolean) : [];
    const praise = Array.isArray(o.praise) ? o.praise.filter(Boolean) : [];
    const improve = Array.isArray(o.improve) ? o.improve.filter(Boolean) : [];
    const tomorrow = Array.isArray(o.tomorrowTop3Suggestion) ? o.tomorrowTop3Suggestion.filter(Boolean) : [];

    // 화면에서 텍스트로도 보여줄 수 있게 합쳐둔다(하위호환)
    const outputText =
      [
        "[1) 오늘의 한 줄 결산]",
        summary ? `- ${summary}` : "-",
        "",
        "[2) 행동 회계 분석]",
        ...gaps.map((x: string) => `- ${x}`),
        "",
        "[3) 긍정 요인]",
        ...praise.map((x: string) => `- ${x}`),
        "",
        "[4) 개선 포인트]",
        ...improve.map((x: string) => `- ${x}`),
        "",
        "[5) 내일 제안 Top3]",
        ...tomorrow.map((x: string) => `- ${x}`),
      ]
        .filter((v) => v !== undefined && v !== null)
        .join("\n");

    return {
      outputText,
      output: { summary, gaps, praise, improve, tomorrowTop3Suggestion: tomorrow },
    };
  }

  // 3) 아무것도 없으면 빈 텍스트(이 경우 UI에서 "비어있음"으로 보이게 됨)
  return { outputText: "" };
}

export default function DailyReviewPage() {
  const router = useRouter();
  const todayYmd = useMemo(() => getTodayKst(), []);

  // auth
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // firestore data
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  const [entries, setEntries] = useState<EntryDoc[]>([]);
  const [review, setReview] = useState<ReviewDoc | null>(null);

  // ui states
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [reflection, setReflection] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [userNotes, setUserNotes] = useState("");
  const [generatingFeedback, setGeneratingFeedback] = useState(false);

  const [reaction, setReaction] = useState("");
  const [savingReaction, setSavingReaction] = useState(false);

  // computed
  const computedLive = useMemo(() => computeDaily(entries, plan), [entries, plan]);
  const entriesDigest = useMemo(() => digestEntries(entries, 50) ?? [], [entries]);

  const runCount = review?.feedback?.runSeq ?? 0;
  const maxFeedbackRuns = 4;
  const runLimitReached = runCount >= maxFeedbackRuns;

  // active run
  const activeRun = useMemo(() => {
    const fb = review?.feedback;
    if (!fb?.activeRunId) return null;
    return fb.runs?.find((r: any) => r.runId === fb.activeRunId) ?? null;
  }, [review?.feedback]);

  const LimitFeedback = async () => {
    if (generatingFeedback || runLimitReached) return;

    try {
      setGeneratingFeedback(true);
      await generateFeedback();
    } finally {
      setGeneratingFeedback(false);
    }
  };

  // auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // subscribe firestore
  useEffect(() => {
    if (!authReady || !user) return;

    setLoading(true);
    setErrorText("");

    const uid = user.uid;

    const planRef = doc(db, "users", uid, "days", todayYmd, "plan", "main");
    const reviewRef = doc(db, "users", uid, "days", todayYmd, "review", "main");
    const entriesCol = collection(db, "users", uid, "days", todayYmd, "entries");
    const entriesQ = query(entriesCol, orderBy("createdAt", "asc"));

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        planRef,
        (snap) => setPlan(snap.exists() ? (snap.data() as PlanDoc) : null),
        (e) => setErrorText(e.message)
      )
    );

    unsubs.push(
      onSnapshot(
        entriesQ,
        (snap) => {
          const list: EntryDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          setEntries(list);
        },
        (e) => setErrorText(e.message)
      )
    );

    unsubs.push(
      onSnapshot(
        reviewRef,
        (snap) => {
          const r = snap.exists() ? (snap.data() as ReviewDoc) : null;
          setReview(r);

          // 처음 로딩 시에만 reflection 채우기 (사용자 입력 덮어쓰기 방지)
          if (r?.reflection && !reflection) setReflection(r.reflection);
        },
        (e) => setErrorText(e.message)
      )
    );

    setLoading(false);

    return () => unsubs.forEach((u) => u());
    // reflection은 deps에 넣으면 덮어쓰기 타이밍이 꼬일 수 있어 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, todayYmd]);

  const saveReview = async () => {
    if (!user) return;

    try {
      setSavingReview(true);
      setErrorText("");

      const uid = user.uid;
      const reviewRef = doc(db, "users", uid, "days", todayYmd, "review", "main");

      // review 문서는 "회고/집계/피드백 히스토리"의 컨테이너
      const payload = deepRemoveUndefined({
        reflection: reflection ?? "",
        computed: computedLive ?? {
          totalMinutes: 0,
          entryCount: 0,
          successCount: 0,
          planTotal: 0,
          planDone: 0,
          byCategory: {},
        },
        feedback: review?.feedback ?? { activeRunId: null, runSeq: 0, runs: [] },
        createdAt: review?.createdAt ?? new Date(),
        updatedAt: new Date(),
      });

      await setDoc(reviewRef, payload, { merge: true });
      setLastSavedAt(new Date().toLocaleTimeString("ko-KR"));
    } catch (e: any) {
      setErrorText(e?.message ?? "Save failed");
    } finally {
      setSavingReview(false);
    }
  };

  const generateFeedback = async () => {
    if (!user) return;
    if (!reflection.trim()) {
      setErrorText("Reflection을 먼저 작성해줘.");
      return;
    }

    try {
      setGeneratingFeedback(true);
      setErrorText("");

      // 1) OpenAI API route 호출
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayYmd,
          plan: plan ? { top3: ensureTop3(plan), note: plan.note ?? "" } : null,
          entriesDigest,
          computedDigest: {
            totalMinutes: computedLive.totalMinutes ?? 0,
            entryCount: computedLive.entryCount ?? 0,
            successCount: computedLive.successCount ?? 0,
            byCategory: computedLive.byCategory ?? {},
          },
          reflection,
          userNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `feedback api error: ${res.status}`);
      }

      const raw = await res.json();
      const parsed = parseFeedbackResponse(raw);

      if (!parsed.outputText.trim() && !parsed.output) {
        throw new Error("feedback api returned empty result");
      }

      // 2) Firestore에 feedback run push (최대 3개 cap)
      const uid = user.uid;
      const reviewRef = doc(db, "users", uid, "days", todayYmd, "review", "main");

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reviewRef);
        const cur = snap.exists() ? (snap.data() as ReviewDoc) : null;

        const fb = cur?.feedback ?? ({ activeRunId: null, runSeq: 0, runs: [] } as any);
        const nextSeq = (fb.runSeq ?? 0) + 1;

        const runId = crypto.randomUUID();
        const parentRunId = fb.activeRunId ? String(fb.activeRunId) : null;

        // 중요: Firestore는 "undefined" 저장을 허용하지 않는다.
        // 그래서 parentRunId는 null 또는 아예 필드 제거 방식으로 처리한다.
        const newRun = deepRemoveUndefined({
          runId,
          seq: nextSeq,
          createdAt: new Date(),
          status: "created",
          input: {
            date: todayYmd,
            planSnapshot: { top3: ensureTop3(plan), note: plan?.note ?? "" },
            entriesSnapshot: {
              itemsDigest: entriesDigest ?? [],
              computedDigest: {
                totalMinutes: computedLive.totalMinutes ?? 0,
                entryCount: computedLive.entryCount ?? 0,
                successCount: computedLive.successCount ?? 0,
                byCategory: computedLive.byCategory ?? {},
              },
            },
            reflectionSnapshot: reflection ?? "",
            userContext: { notes: userNotes ?? "" },
            ...(parentRunId ? { parentRunId } : {}),
          },
          // 신버전: outputText(전체 텍스트)
          outputText: parsed.outputText,
          // 구버전: output(JSON)도 있을 수 있으니 같이 저장(하위호환)
          ...(parsed.output ? { output: parsed.output } : {}),
        }) as any;

        // 기존 active run을 superseded 처리(선택)
        const updatedRuns = (fb.runs ?? []).map((r: any) =>
          fb.activeRunId && r.runId === fb.activeRunId ? { ...r, status: "superseded" as const } : r
        );

        const nextRuns = [...updatedRuns, newRun].sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0));
        while (nextRuns.length > 3) nextRuns.shift();

        const payload = deepRemoveUndefined({
          reflection: cur?.reflection ?? reflection ?? "",
          computed: cur?.computed ?? computedLive ?? {},
          feedback: {
            activeRunId: runId,
            runSeq: nextSeq,
            runs: nextRuns,
          },
          createdAt: cur?.createdAt ?? new Date(),
          updatedAt: new Date(),
        });

        tx.set(reviewRef, payload, { merge: true });
      });

      setUserNotes("");
    } catch (e: any) {
      setErrorText(e?.message ?? "Generate feedback failed");
    } finally {
      setGeneratingFeedback(false);
    }
  };

  const saveReaction = async () => {
    if (!user) return;
    if (!reaction.trim()) return;
    if (!review?.feedback?.activeRunId) return;

    try {
      setSavingReaction(true);
      setErrorText("");

      const uid = user.uid;
      const reviewRef = doc(db, "users", uid, "days", todayYmd, "review", "main");

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reviewRef);
        if (!snap.exists()) throw new Error("review/main does not exist.");

        const cur = snap.data() as ReviewDoc;
        const fb: any = cur.feedback;
        if (!fb?.activeRunId) throw new Error("No active feedback run.");

        const runs = (fb.runs ?? []).map((r: any) =>
          r.runId === fb.activeRunId
            ? deepRemoveUndefined({
                ...r,
                userReaction: {
                  comment: reaction ?? "",
                  accepted: [],
                  rejected: [],
                  createdAt: new Date(),
                },
              })
            : r
        );

        const payload = deepRemoveUndefined({
          feedback: { ...fb, runs },
          updatedAt: new Date(),
        });

        tx.set(reviewRef, payload, { merge: true });
      });

      setReaction("");
    } catch (e: any) {
      setErrorText(e?.message ?? "Save reaction failed");
    } finally {
      setSavingReaction(false);
    }
  };

  if (!authReady) {
    return <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>Loading...</main>;
  }

  if (!user) {
    return <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>Redirecting...</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Daily Review</h1>
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
            {todayYmd} · {user.email ?? user.uid}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            onClick={() => router.replace("/today")}
          >
            Today
          </Button>
          <Button
            onClick={() => router.replace("/plan")}
          >
            Plan
          </Button>
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Today Summary</h2>
        <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
          Plan/Entries 기반으로 자동 집계된 값이야(화면용 live computed).
        </p>

        {loading ? (
          <p style={{ opacity: 0.8, marginTop: 10 }}>Loading...</p>
        ) : (
          <div
            style={{
              marginTop: 10,
              border: "1px solid rgba(255, 255, 255, 0.28)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 6,
            }}
          >
            <div>총 시간: {computedLive.totalMinutes}분</div>
            <div>기록 수: {computedLive.entryCount}</div>
            <div>성공 수: {computedLive.successCount}</div>
            <div>
              Plan 달성: {computedLive.planDone}/{computedLive.planTotal}
            </div>
            <div>카테고리: {byCategoryText(computedLive.byCategory)}</div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Plan</h2>
        <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>오늘 Top3와 Note</p>

        {plan ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {(plan.top3 ?? defaultTop3()).map((t, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.28)",
                  borderRadius: 12,
                  padding: 10,
                  opacity: t.text ? 1 : 0.6,
                }}
              >
                <div style={{ fontSize: 14, textDecoration: t.done ? "line-through" : "none" }}>
                  {t.text || `(목표 ${idx + 1} 비어있음)`}
                </div>
              </div>
            ))}
            {plan.note ? (
              <div style={{ border: "1px solid rgba(255, 255, 255, 0.28)", borderRadius: 12, padding: 10, opacity: 0.9 }}>
                Note: {plan.note}
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ opacity: 0.8, marginTop: 10 }}>plan/main 문서가 아직 없어요.</p>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>What I did (Entries)</h2>
        <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>오늘 기록된 entries</p>

        {entries.length === 0 ? (
          <p style={{ opacity: 0.8, marginTop: 10 }}>오늘 entries가 없어요.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {entries.map((e) => (
              <div
                key={e.id}
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.28)",
                  borderRadius: 12,
                  padding: 10,
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 14 }}>
                  <strong>{e.minutes}m</strong> [{e.category}] {e.text}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  mood: {e.mood} · {e.success ? "success" : "fail"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Reflection</h2>
        <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
          저장하면 review/main.reflection + computed 스냅샷이 갱신돼.
        </p>

        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="오늘을 돌아보며 느낀 점 / 원인 / 개선점"
          style={{
            marginTop: 10,
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.28)",
            fontSize: 14,
          }}
          className="tl-textarea"
        />

        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Button
            onClick={saveReview}
            disabled={savingReview}
          >
            {savingReview ? "Saving..." : "Save Review"}
          </Button>

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {lastSavedAt ? `Last saved: ${lastSavedAt}` : "Not saved yet"}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Feedback</h2>
        <p style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
          예외상황/제약/내 생각을 입력해서 2~3번 피드백을 반복할 수 있어(최대 3개 저장).
        </p>

        <textarea
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="예: 야근/컨디션/가족행사 때문에 계획을 지키기 어려웠음. 내일은 오전만 집중 가능."
          style={{
            marginTop: 10,
            width: "100%",
            minHeight: 90,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.28)",
            fontSize: 14,
          }}
          className="tl-textarea"
        />
        
        {/* Active feedback */}
        <div style={{ marginTop: 12 }}>
          {activeRun ? (
            <div style={{ border: "1px solid rgba(255, 255, 255, 0.28)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 600 }}>Active Run #{(activeRun as any).seq}</div>

              {/* 신버전: outputText(전체 텍스트) 출력 */}
              {(activeRun as any).outputText ? (
                <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{(activeRun as any).outputText}</div>
              ) : (
                <>
                  {/* 구버전: output(JSON) UI 출력 */}
                  <div style={{ marginTop: 10 }}>{(activeRun as any).output?.summary ?? ""}</div>

                  <div style={{ marginTop: 10 }}>
                    <strong>Gaps</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {(((activeRun as any).output?.gaps ?? []) as string[]).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <strong>Praise</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {(((activeRun as any).output?.praise ?? []) as string[]).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <strong>Improve</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {(((activeRun as any).output?.improve ?? []) as string[]).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <strong>Tomorrow Top3 Suggestions</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {(((activeRun as any).output?.tomorrowTop3Suggestion ?? []) as string[]).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <div style={{ marginTop: 14 }}>
                <strong>My reaction</strong>

                {(activeRun as any).userReaction?.comment ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255, 255, 255, 0.28)",
                      background: "rgba(0,0,0,0.03)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {(activeRun as any).userReaction.comment}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={reaction}
                      onChange={(e) => setReaction(e.target.value)}
                      placeholder="피드백을 받고 든 생각 / 동의·비동의 / 추가 질문"
                      style={{
                        marginTop: 10,
                        width: "100%",
                        minHeight: 90,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid rgba(255, 255, 255, 0.28)",
                        fontSize: 14,
                      }}
                      className="tl-textarea"
                    />
                    <div style={{ marginTop: 12 }}>
                      <Button
                        onClick={saveReaction}
                        disabled={savingReaction}
                      >
                        {savingReaction ? "Saving..." : "Save reaction"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p style={{ opacity: 0.8, marginTop: 10 }}>아직 생성된 피드백이 없어요.</p>
          )}
        </div>
          
        {/* History */}
        {review?.feedback?.runs?.length ? (
          <div style={{ marginTop: 12, opacity: 0.85, fontSize: 13 }}>
            History:{" "}
            {review.feedback.runs
              .slice()
              .sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0))
              .map((r: any) => `#${r.seq}${r.runId === review.feedback!.activeRunId ? "*" : ""}`)
              .join(" / ")}
          </div>
        ) : null}
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <Button
            onClick={LimitFeedback}
            disabled={generatingFeedback || runLimitReached}
          >
            {runLimitReached
              ? "Limit Reached"
              : generatingFeedback
              ? "Generating..."
              : "Generate Feedback"}
          </Button>

          <div style={{ fontSize: 12, opacity: 0.75 }}>runs: {runCount}/{maxFeedbackRuns}</div>
        </div>
      </section>

      {errorText && (
        <div
          style={{
            marginTop: 16,
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

    </main>
  );
}
