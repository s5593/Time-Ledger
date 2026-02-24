import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator, // 필요하면 사용
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// local persistence (프로덕션/에뮬레이터 공통)
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error("setPersistence error:", e);
});

// --- Emulator 연결 (개발에서만, 브라우저에서만) ---
const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "1";

if (USE_EMULATOR && typeof window !== "undefined") {
  // Firestore emulator
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.log("[firebase] Firestore emulator connected");
  } catch (e) {
    // HMR로 이미 연결된 경우 에러가 날 수 있는데 무시해도 됨
    console.warn("[firebase] Firestore emulator connect skipped:", e);
  }

  // Auth emulator도 쓰고 싶으면 아래 주석 해제 + 에뮬레이터 실행에 auth 포함
  // try {
  //   connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  //   console.log("[firebase] Auth emulator connected");
  // } catch (e) {
  //   console.warn("[firebase] Auth emulator connect skipped:", e);
  // }
}
