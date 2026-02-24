// hooks/useReview.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ReviewDoc, ReviewComputed, FeedbackRun, FeedbackOutput, PlanDoc } from "@/lib/types";
import { deepRemoveUndefined, assertNoUndefined } from "@/lib/firestoreSanitize";

function reviewRef(uid: string, date: string) {
  return doc(db, "users", uid, "days", date, "review", "main");
}

function nowDate() {
  return new Date();
}

function getUidOrThrow() {
  const uid = (window as any).__TL_UID__ as string | undefined;
  if (!uid) throw new Error("No uid. Auth guard not ready.");
  return uid;
}

function ensureTop3(plan: PlanDoc | null) {
  const base = plan?.top3 ?? [];
  const top3 = base.slice(0, 3).map((x) => ({ text: x?.text ?? "", done: !!x?.done }));
  while (top3.length < 3) top3.push({ text: "", done: false });
  return { top3, note: plan?.note ?? "" };
}

function ensureReviewComputed(computed?: ReviewComputed | null): ReviewComputed {
  return (
    computed ?? {
      totalMinutes: 0,
      entryCount: 0,
      successCount: 0,
      planTotal: 0,
      planDone: 0,
      byCategory: {},
    }
  );
}

function ensureFeedback(review?: ReviewDoc | null) {
  const fb = review?.feedback ?? null;
  return {
    activeRunId: fb?.activeRunId ?? null,
    runSeq: fb?.runSeq ?? 0,
    runs: (fb?.runs ?? []) as FeedbackRun[],
  };
}

export function useReview(date: string) {
  const [review, setReview] = useState<ReviewDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    try {
      const uid = getUidOrThrow();
      unsub = onSnapshot(
        reviewRef(uid, date),
        (snap) => {
          setReview(snap.exists() ? (snap.data() as ReviewDoc) : null);
          setLoading(false);
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        }
      );
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setLoading(false);
    }

    return () => unsub?.();
  }, [date]);

  const saveReview = useCallback(
    async (reflection: string, computed: ReviewComputed) => {
      const uid = getUidOrThrow();
      const ref = reviewRef(uid, date);

      const payload = deepRemoveUndefined({
        reflection: reflection ?? "",
        computed: ensureReviewComputed(computed),
        feedback: ensureFeedback(review),
        updatedAt: nowDate(),
        createdAt: review?.createdAt ?? nowDate(),
      });

      // 여기서 undefined 위치가 찍히면, 원인이 saveReview payload에 있다는 뜻
      assertNoUndefined(payload, "saveReview.payload");

      await setDoc(ref, payload, { merge: true });
    },
    [date, review]
  );

  const appendFeedbackRun = useCallback(
    async (params: {
      plan: PlanDoc | null;
      entriesDigest: Array<{ text: string; minutes: number; category: string; mood: string; success: boolean }>;
      computedDigest: { totalMinutes: number; entryCount: number; successCount: number; byCategory: Record<string, number> };
      reflectionSnapshot: string;
      userNotes: string;
      output: FeedbackOutput;
    }) => {
      const uid = getUidOrThrow();
      const ref = reviewRef(uid, date);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const cur = (snap.exists() ? (snap.data() as ReviewDoc) : null) ?? null;

        const feedback = ensureFeedback(cur);
        const nextSeq = (feedback.runSeq ?? 0) + 1;

        const runId = crypto.randomUUID();
        const parentRunId = feedback.activeRunId ?? null;

        const { top3, note } = ensureTop3(params.plan);

        const newRun: FeedbackRun = deepRemoveUndefined({
          runId,
          seq: nextSeq,
          createdAt: nowDate(),
          status: "created",
          input: {
            date,
            planSnapshot: { top3, note },
            entriesSnapshot: {
              itemsDigest: params.entriesDigest ?? [],
              computedDigest: params.computedDigest ?? {
                totalMinutes: 0,
                entryCount: 0,
                successCount: 0,
                byCategory: {},
              },
            },
            reflectionSnapshot: params.reflectionSnapshot ?? "",
            userContext: { notes: params.userNotes ?? "" },
            ...(parentRunId ? { parentRunId } : {}),
          },
          output: params.output,
        }) as FeedbackRun;

        const runsUpdated = (feedback.runs ?? []).map((r) =>
          feedback.activeRunId && r.runId === feedback.activeRunId ? ({ ...r, status: "superseded" } as FeedbackRun) : r
        );

        const nextRuns = [...runsUpdated, newRun].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
        while (nextRuns.length > 3) nextRuns.shift();

        const payload = deepRemoveUndefined({
          feedback: {
            activeRunId: runId,
            runSeq: nextSeq,
            runs: nextRuns,
          },
          updatedAt: nowDate(),
          createdAt: cur?.createdAt ?? nowDate(),
          reflection: cur?.reflection ?? "",
          computed: ensureReviewComputed(cur?.computed),
        });

        // 여기서 undefined 위치가 찍히면, 원인이 appendFeedbackRun payload에 있다는 뜻
        assertNoUndefined(payload, "appendFeedbackRun.payload");

        tx.set(ref, payload, { merge: true });
      });
    },
    [date]
  );

  const saveReaction = useCallback(
    async (comment: string, accepted: string[] = [], rejected: string[] = []) => {
      const uid = getUidOrThrow();
      const ref = reviewRef(uid, date);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Review document not found.");

        const cur = snap.data() as ReviewDoc;
        const fb = ensureFeedback(cur);
        if (!fb.activeRunId) throw new Error("No active feedback run.");

        const runs = (fb.runs ?? []).map((r) =>
          r.runId === fb.activeRunId
            ? (deepRemoveUndefined({
                ...r,
                userReaction: {
                  comment: comment ?? "",
                  accepted: accepted ?? [],
                  rejected: rejected ?? [],
                  createdAt: nowDate(),
                },
              }) as FeedbackRun)
            : r
        );

        const payload = deepRemoveUndefined({
          feedback: { ...fb, runs },
          updatedAt: nowDate(),
        });

        // 여기서 undefined 위치가 찍히면, 원인이 saveReaction payload에 있다는 뜻
        assertNoUndefined(payload, "saveReaction.payload");

        tx.set(ref, payload, { merge: true });
      });
    },
    [date]
  );

  return { review, loading, error, saveReview, appendFeedbackRun, saveReaction };
}
