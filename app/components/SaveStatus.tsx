// components/SaveStatus.tsx
"use client";

export default function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return <span style={{ opacity: 0.6 }}> </span>;
  if (status === "saving") return <span style={{ opacity: 0.7 }}>saving...</span>;
  if (status === "saved") return <span style={{ opacity: 0.7 }}>saved</span>;
  return <span style={{ opacity: 0.7 }}>error</span>;
}
