import { db } from "./firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export async function upsertUser(uid: string, data: { displayName?: string; email?: string }) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    {
      displayName: data.displayName ?? null,
      email: data.email ?? null,
      plan: "free",
      createdAt: new Date(),
      lastLoginAt: new Date(),
    },
    { merge: true }
  );
}
