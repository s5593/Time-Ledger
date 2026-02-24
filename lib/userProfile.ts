// lib/userProfile.ts
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export async function ensureUserProfile(user: User) {
  const ref = doc(db, "users", user.uid);

  // merge:true => 최초엔 생성, 이후엔 필요한 필드만 업데이트
  await setDoc(
    ref,
    {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,

      // 앱 메타
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Seoul",
      createdAt: new Date(),
      lastLoginAt: new Date(),
    },
    { merge: true }
  );
}
