import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Time Ledger v2</h1>
      <p style={{ marginTop: 12 }}>기초 페이지 확인용</p>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <Link href="/login">/login</Link>
        <Link href="/today">/today</Link>
        <Link href="/plan">/plan</Link>
        <Link href="/daily-review">/daily-review</Link>
      </div>
    </main>
  );
}
