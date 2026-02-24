// lib/prompts/dailyReviewPromptV1.ts
// ============================================================
// Time Ledger v2 - Daily AI Review Master Prompt (v1.0)
// ------------------------------------------------------------
// 📌 이 파일의 목적
// - Daily Review용 AI 프롬프트를 한 곳에 모아 관리하기 위함.
// - route.ts에서 직접 문자열을 작성하지 않고,
//   이 파일을 import하여 사용하도록 분리.
// - 나중에 길이 제한(1000~1500자), 섹션 구조, 톤 조정 등을
//   이 파일만 수정하면 되도록 하기 위함.
//
// 📌 이 프롬프트의 성격
// - 감정 위로형 AI가 아님.
// - 데이터 기반 행동 분석 + 자기성찰 중심.
// - 하루 기록을 “행동 회계 + 사고 패턴 분석”으로 구조화.
// - MVP 단계에서 가장 중요한 코어 분석 엔진 역할.
//
// ============================================================

/**
 * 시스템 프롬프트
 *
 * 역할:
 * - 모델의 정체성을 정의
 * - 말투, 분석 방식, 길이, 형식 고정
 * - 감성 위로형으로 흐르는 것을 방지
 * - 반복/장황함 방지
 */
export const DAILY_REVIEW_SYSTEM_PROMPT_V1 = `
You are the Daily Reflective Behavioral Coach for a time-ledger application.

Your role balances:
- 40% self-reflection (insight, meaning, internal patterns)
- 40% behavioral accounting (evidence-based analysis using time data)
- 20% productivity optimization (clear and realistic next steps)

Core principles:
- Base all judgments on provided data.
- Do not give generic motivation.
- Do not over-praise or over-criticize.
- No therapy tone. No clichés.
- Be calm, analytical, and precise.
- Every paragraph must add new information.
- Avoid repetition.

Length requirement:
- Total output must be between 1000 and 1500 Korean characters.
- Keep it within one structured page.
- Dense but readable.

Formatting rules:
- Use the exact section headers below.
- Each section must contain 2–5 bullet points.
- Do not add extra sections.
- Do not repeat user input verbatim.
- Use short but meaningful sentences.

Focus:
This is not a diary summary.
This is an evidence-based behavioral analysis with reflective depth.

Required Output Format (fixed):

[1) 오늘의 한 줄 결산]
- …

[2) 행동 회계 분석]
- …
- …
- …

[3) 패턴 및 원인 가설]
- …
- …
- …

[4) 생산성 관점 교정]
- …
- …
- …

[5) 자기성찰 포인트]
- …
- …
- …
`.trim();

/**
 * 서버에서 전달받는 입력 데이터 타입
 *
 * 이 구조는 Firestore의:
 * - plan/main
 * - entries 집계(computed)
 * - review/main
 * 등을 조합해서 만들어지도록 설계됨.
 *
 * 📌 이 타입은 "AI에 넘길 데이터 스냅샷"
 * 즉, 하루 상태의 압축본이다.
 */
export type DailyReviewPromptV1Input = {
  date?: string;

  planTop3?: Array<{
    text?: string;
    plannedMin?: number | null;
  }>;

  actualSummary?: {
    totalTrackedMin?: number | null;
    deepFocusMin?: number | null;
    shallowWorkMin?: number | null;
    distractionMin?: number | null;
    restHealthMin?: number | null;
  };

  categoryBreakdown?: Array<{
    category?: string;
    min?: number | null;
  }>;

  outcome?: {
    completed?: string;
    partiallyDone?: string;
    notDone?: string;
    biggestDeviationReason?: string;
  };

  moodEnergy?: {
    avgMood1to5?: number | null;
    energy1to5?: number | null;
    notableEmotionEvents?: string;
  };

  userReflection?: {
    whatWentWell?: string;
    whatWasDifficult?: string;
    whyItHappenedMyGuess?: string;
    oneThingLearned?: string;
  };
};

/**
 * 📌 사용자 입력 템플릿 생성 함수
 *
 * 역할:
 * - Firestore 데이터들을 하나의 텍스트 구조로 조립
 * - 모델이 구조적으로 이해하도록 강제
 * - 필드가 비어 있어도 형식은 유지
 *
 * 왜 서버에서 조립하나?
 * - 클라이언트에서 문자열을 만들면 조작 가능성 ↑
 * - 서버에서 통일된 포맷 보장
 * - 프롬프트 안정성 확보
 */
export function buildDailyReviewUserMessageV1(
  input: DailyReviewPromptV1Input
): string {
  const date = safeLine(input.date, "yyyy-mm-dd");

  const planTop3 = normalizeTop3(input.planTop3);
  const actual = input.actualSummary ?? {};
  const breakdown = normalizeBreakdown(input.categoryBreakdown);
  const outcome = input.outcome ?? {};
  const mood = input.moodEnergy ?? {};
  const refl = input.userReflection ?? {};

  return [
    `[DATE] ${date}`,
    ``,
    `[PLAN TOP3]`,
    ...planTop3.map(
      (t, i) =>
        `${i + 1}) ${safeLine(t.text, "—")} / planned ${formatMin(
          t.plannedMin
        )}m`
    ),
    ``,
    `[ACTUAL SUMMARY]`,
    `- Total tracked: ${formatMin(actual.totalTrackedMin)}m`,
    `- Deep focus: ${formatMin(actual.deepFocusMin)}m`,
    `- Shallow work: ${formatMin(actual.shallowWorkMin)}m`,
    `- Distraction: ${formatMin(actual.distractionMin)}m`,
    `- Rest/health: ${formatMin(actual.restHealthMin)}m`,
    ``,
    `[CATEGORY BREAKDOWN]`,
    ...breakdown.map(
      (b) => `- ${safeLine(b.category, "—")}: ${formatMin(b.min)}m`
    ),
    ...(breakdown.length === 0 ? [`- —: —m`] : []),
    ``,
    `[OUTCOME]`,
    `- Completed: ${safeLine(outcome.completed, "—")}`,
    `- Partially done: ${safeLine(outcome.partiallyDone, "—")}`,
    `- Not done: ${safeLine(outcome.notDone, "—")}`,
    `- Biggest deviation reason (user choice): ${safeLine(
      outcome.biggestDeviationReason,
      "—"
    )}`,
    ``,
    `[MOOD & ENERGY]`,
    `- Avg mood (1~5): ${formatScore(mood.avgMood1to5)}`,
    `- Energy (1~5): ${formatScore(mood.energy1to5)}`,
    `- Notable emotion/events: ${safeLine(
      mood.notableEmotionEvents,
      "—"
    )}`,
    ``,
    `[USER REFLECTION]`,
    `- What went well: ${safeLine(refl.whatWentWell, "—")}`,
    `- What was difficult: ${safeLine(refl.whatWasDifficult, "—")}`,
    `- Why it happened (my guess): ${safeLine(
      refl.whyItHappenedMyGuess,
      "—"
    )}`,
    `- One thing learned: ${safeLine(refl.oneThingLearned, "—")}`,
  ].join("\n");
}

/* ============================================================
   아래는 내부 유틸 함수
   (AI 품질을 안정시키기 위한 전처리 로직)
   ============================================================ */

/**
 * 문자열 정리
 * - 공백 정리
 * - 빈 값 fallback 처리
 */
function safeLine(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s.replace(/\s+/g, " ") : fallback;
}

/**
 * 분(minute) 포맷 정리
 * 숫자가 아니면 0으로 처리
 */
function formatMin(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "0";
  return String(Math.max(0, Math.round(v)));
}

/**
 * 점수(1~5) 포맷 정리
 */
function formatScore(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return String(Math.max(1, Math.min(5, Math.round(v))));
}

/**
 * Top3는 항상 3개 슬롯 유지
 * 부족하면 빈 슬롯 채움
 */
function normalizeTop3(
  arr?: DailyReviewPromptV1Input["planTop3"]
) {
  const base = Array.isArray(arr) ? arr.slice(0, 3) : [];
  while (base.length < 3) base.push({});
  return base;
}

/**
 * 카테고리는 최대 8개만 사용
 */
function normalizeBreakdown(
  arr?: DailyReviewPromptV1Input["categoryBreakdown"]
) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 8);
}
