// hooks/useDailyBundle.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTodayEntries } from "./useTodayEntries";
import { usePlan } from "./usePlan";
import { useReview } from "./useReview";
import { computeDaily, digestEntries } from "@/lib/daily"; // 아래 2)에서 추가할 유틸
import type { EntryDoc, PlanDoc, ReviewDoc, ReviewComputed } from "@/lib/types";

type Bundle = {
  date: string;
  entries: EntryDoc[];
  plan: PlanDoc | null;
  review: ReviewDoc | null;
  computedLive: ReviewComputed;
  entriesDigest: ReturnType<typeof digestEntries>;
};

export function useDailyBundle(date: string) {
  const { entries, loading: entriesLoading, error: entriesError } = useTodayEntries(date);
  const { plan, loading: planLoading, error: planError } = usePlan(date);
  const { review, loading: reviewLoading, error: reviewError, saveReview } = useReview(date);

  const computedLive = useMemo(() => computeDaily(entries, plan), [entries, plan]);
  const entriesDigest = useMemo(() => digestEntries(entries, 50), [entries]);

  const loading = entriesLoading || planLoading || reviewLoading;
  const error = entriesError || planError || reviewError;

  const bundle: Bundle = {
    date,
    entries,
    plan,
    review,
    computedLive,
    entriesDigest,
  };

  return { bundle, loading, error, saveReview };
}
