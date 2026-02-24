"use client";

import { usePathname } from "next/navigation";

type Props = {
  label?: string;
};

export function GlobalAdBanner({ label = "Sponsored" }: Props) {
  const pathname = usePathname();

  // UX 보호: 로그인/로딩/민감한 흐름에서 숨기고 싶으면 여기서 제어
  // 지금은 “모든 페이지” 원칙이니 일단 항상 보여줌.
  // 예외가 필요해지면 아래처럼 조건 추가 가능:
  // if (pathname === "/login") return null;

  return (
    <footer className="tl-global-ad" aria-label="Advertisement">
      <div className="tl-global-ad__inner">
        <div className="tl-global-ad__label">{label}</div>
        <div className="tl-global-ad__box">
          <div className="tl-global-ad__placeholder">Global banner placeholder (e.g., 728×90 / 320×100)</div>
        </div>
      </div>
    </footer>
  );
}
