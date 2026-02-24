// lib/date.ts
/**
 * KST(Asia/Seoul) 기준 오늘 날짜를 YYYY-MM-DD로 반환
 * - 환경(서버/클라) timezone 영향을 최소화하기 위해
 *   Intl.DateTimeFormat을 사용해서 KST 날짜 문자열을 생성한다.
 */
export function getTodayKst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

/**
 * 주어진 Date를 KST 기준 YYYY-MM-DD로 변환
 */
export function toKstDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

/**
 * YYYY-MM-DD 유효성 체크 (간단)
 */
export function isValidYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd);
}
