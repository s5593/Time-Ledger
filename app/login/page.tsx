// app/login/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";

import { auth } from "../../lib/firebase"; // 너 프로젝트 경로에 맞춰 유지
import { ensureUserProfile } from "../../lib/userProfile"; // ✅ 추가

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") ? n : "/today";
  }, [searchParams]);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user ?? null);
      setAuthReady(true);

      if (user) router.replace(nextPath);
    });

    return () => unsub();
  }, [router, nextPath]);

  const handleGooglePopupSignIn = async () => {
    setLoading(true);
    setErrorText(null);

    try {
      await setPersistence(auth, browserLocalPersistence);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const cred = await signInWithPopup(auth, provider);

      // ✅ 최초 사용자 문서 생성/갱신
      await ensureUserProfile(cred.user);

      router.replace(nextPath);
    } catch (e: any) {
      console.error("[auth] popup error:", e?.code, e?.message, e);

      const code = String(e?.code ?? "unknown");
      if (code.includes("auth/popup-blocked")) {
        setErrorText("팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도하세요.");
      } else if (code.includes("auth/popup-closed-by-user")) {
        setErrorText("팝업을 닫았습니다. 다시 시도하세요.");
      } else if (code.includes("auth/cancelled-popup-request")) {
        setErrorText("이미 로그인 팝업이 진행 중입니다. 잠시 후 다시 시도하거나 새로고침 후 시도하세요.");
      } else if (code.includes("auth/unauthorized-domain")) {
        setErrorText("Firebase 콘솔 Authorized domains에 현재 도메인(localhost 포함)을 등록해야 합니다.");
      } else {
        setErrorText(`${code}: ${String(e?.message ?? "")}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Time Ledger v2</h1>
        <p style={{ marginTop: 8, marginBottom: 16, opacity: 0.8 }}>Google 계정으로 로그인</p>

        {!authReady ? (
          <div style={{ opacity: 0.8 }}>Auth initializing...</div>
        ) : authUser ? (
          <div style={{ opacity: 0.9 }}>
            Already signed in. Redirecting to <b>{nextPath}</b>...
          </div>
        ) : (
          <>
            <Button
              onClick={handleGooglePopupSignIn}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in with Google (Popup)"}
            </Button>

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

            <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
              성공 후 이동: <b>{nextPath}</b>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
