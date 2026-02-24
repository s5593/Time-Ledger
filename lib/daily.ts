// lib/daily.ts
import type { EntryDoc, PlanDoc, ReviewComputed } from "./types";

export function computeDaily(entries: EntryDoc[], plan: PlanDoc | null): ReviewComputed {
  let totalMinutes = 0;
  let successCount = 0;
  const byCategory: Record<string, number> = {};

  for (const e of entries) {
    const m = Number.isFinite(e.minutes) ? e.minutes : 0;
    totalMinutes += m;
    if (e.success) successCount += 1;
    const cat = e.category || "uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + m;
  }

  const entryCount = entries.length;
  const planTotal = plan?.top3?.length ?? 0;
  const planDone = (plan?.top3 ?? []).filter((x) => x.done).length;

  return { totalMinutes, entryCount, successCount, planTotal, planDone, byCategory };
}

export function digestEntries(entries: EntryDoc[], maxItems = 50) {
  return entries
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    })
    .slice(0, maxItems)
    .map((e) => ({
      text: e.text,
      minutes: e.minutes,
      category: e.category,
      mood: e.mood,
      success: e.success,
    }));
}
