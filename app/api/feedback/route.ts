// app/api/feedback/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";

import {
  DAILY_REVIEW_SYSTEM_PROMPT_V1,
  buildDailyReviewUserMessageV1,
  type DailyReviewPromptV1Input,
} from "@/lib/prompts/dailyReviewPromptV1";

export const runtime = "nodejs"; // edge에서 동작 안 할 때 대비

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ReqBody = {
  date: string;
  plan: { top3: { text: string; done: boolean }[]; note: string } | null;
  entriesDigest: { text: string; minutes: number; category: string; mood: string; success: boolean }[];
  computedDigest: { totalMinutes: number; entryCount: number; successCount: number; byCategory: Record<string, number> };
  reflection: string;
  userNotes?: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clampMin0Int(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

/**
 * NextResponse.json에 undefined가 섞여도 보통은 괜찮지만,
 * 서버/클라이언트 디버깅 시 일관성을 위해 JSON-safe로 한번 정리한다.
 */
function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(JSON.parse(JSON.stringify(data)), { status });
}

/**
 * ReqBody(현재 앱 payload)를 DailyReviewPromptV1Input(프롬프트 템플릿 입력)으로 변환
 * - 지금 payload에는 planned minutes, deep/shallow 같은 분해 지표가 없으므로 null 처리
 * - mood/energy도 숫자형이 아니라서 null 처리 (나중에 UI 추가되면 채우면 됨)
 */
function mapReqBodyToPromptInput(body: ReqBody): DailyReviewPromptV1Input {
  const planTop3 =
    body.plan?.top3?.slice(0, 3).map((t) => ({
      text: safeTrim(t?.text),
      plannedMin: null,
    })) ?? [];

  const byCategory = body.computedDigest?.byCategory ?? {};
  const categoryBreakdown = Object.entries(byCategory)
    .map(([category, min]) => ({ category, min: clampMin0Int(min) }))
    .sort((a, b) => (b.min ?? 0) - (a.min ?? 0))
    .slice(0, 8);

  const top3 = body.plan?.top3 ?? [];
  const completedTasks = top3.filter((x) => x?.done).map((x) => safeTrim(x.text)).filter(Boolean);
  const notDoneTasks = top3.filter((x) => !x?.done).map((x) => safeTrim(x.text)).filter(Boolean);

  return {
    date: safeTrim(body.date) || "yyyy-mm-dd",
    planTop3,
    actualSummary: {
      totalTrackedMin: clampMin0Int(body.computedDigest?.totalMinutes),
      deepFocusMin: null,
      shallowWorkMin: null,
      distractionMin: null,
      restHealthMin: null,
    },
    categoryBreakdown,
    outcome: {
      completed: completedTasks.length ? completedTasks.join(", ") : "—",
      partiallyDone: "—",
      notDone: notDoneTasks.length ? notDoneTasks.join(", ") : "—",
      biggestDeviationReason: safeTrim(body.userNotes) || "—",
    },
    moodEnergy: {
      avgMood1to5: null,
      energy1to5: null,
      notableEmotionEvents: safeTrim(body.userNotes) || "—",
    },
    userReflection: {
      whatWentWell: safeTrim(body.reflection) || "—",
      whatWasDifficult: "—",
      whyItHappenedMyGuess: safeTrim(body.userNotes) || "—",
      oneThingLearned: "—",
    },
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse({ error: "OPENAI_API_KEY is missing" }, 500);
    }

    const body = (await req.json()) as Partial<ReqBody>;

    // 최소 validation
    if (!isNonEmptyString(body?.date)) return jsonResponse({ error: "date required" }, 400);
    if (!isNonEmptyString(body?.reflection)) return jsonResponse({ error: "reflection required" }, 400);

    // undefined 방지용 기본값 처리
    const normalized: ReqBody = {
      date: body.date.trim(),
      plan: body.plan ?? null,
      entriesDigest: Array.isArray(body.entriesDigest) ? body.entriesDigest : [],
      computedDigest: body.computedDigest ?? { totalMinutes: 0, entryCount: 0, successCount: 0, byCategory: {} },
      reflection: body.reflection.trim(),
      userNotes: safeTrim(body.userNotes),
    };

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const promptInput = mapReqBodyToPromptInput(normalized);
    const userMessage = buildDailyReviewUserMessageV1(promptInput);

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: DAILY_REVIEW_SYSTEM_PROMPT_V1 },
        { role: "user", content: userMessage },
      ],
    });

    const text = resp.output_text?.trim() ?? "";
    if (!text) return jsonResponse({ error: "Empty model output" }, 502);

    return jsonResponse(
      {
        text,
        meta: { model, date: normalized.date },
      },
      200
    );
  } catch (e: any) {
    return jsonResponse({ error: e?.message ?? "Unknown error" }, 500);
  }
}
