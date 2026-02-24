// lib/firestoreSanitize.ts
// Firestore는 undefined를 저장할 수 없다(객체 내부/배열 내부 모두).
// 원인 추적을 위해 undefined 위치(path)를 찾아내는 디버그 유틸을 포함한다.

type UndefinedHit = { path: string; value: undefined };

export function deepRemoveUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    // 배열 원소 undefined 제거 + 내부 재귀 정리
    const cleaned = value
      .filter((v) => v !== undefined)
      .map((v) => deepRemoveUndefined(v));
    return cleaned as any;
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = deepRemoveUndefined(v);
    }
    return out;
  }

  return value;
}

// undefined 위치를 "첫 1개"만 찾아서 반환 (원인 찾기용)
export function findFirstUndefined(value: any, basePath = ""): UndefinedHit | null {
  if (value === undefined) {
    return { path: basePath || "<root>", value: undefined };
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      const hit = findFirstUndefined(v, `${basePath}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const nextPath = basePath ? `${basePath}.${k}` : k;
      const hit = findFirstUndefined(v, nextPath);
      if (hit) return hit;
    }
    return null;
  }

  return null;
}

// Firestore 쓰기 직전에 호출해서, undefined가 있으면 즉시 예외 발생 + 콘솔에 위치 출력
export function assertNoUndefined(value: any, label = "payload"): void {
  const hit = findFirstUndefined(value);
  if (hit) {
    // 콘솔에서 payload 구조를 펼쳐서 볼 수 있게 그대로 출력
    console.error(`[${label}] undefined found at: ${hit.path}`, value);
    throw new Error(`[${label}] undefined found at: ${hit.path}`);
  }
}
