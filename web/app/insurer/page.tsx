"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

// DEMO: stands in for an insurer's backend. A real insurer runs this signing
// step inside their own system (docs/insurer-integration.md) and hands the code
// to their policyholder. Nion never receives a list of policyholders — only a
// single signed code, attached to a single claim.
export default function InsurerDemo() {
  const [policyholder, setPolicyholder] = useState("");
  const [coverageUsd, setCoverageUsd] = useState("2000");
  const [ttlHours, setTtlHours] = useState("24");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function issue() {
    setError(null);
    setCode(null);
    setCopied(false);
    if (!/^0x[0-9a-fA-F]{40}$/.test(policyholder)) {
      return setError("Enter a valid policyholder wallet address (0x…).");
    }
    const cov = parseFloat(coverageUsd);
    if (isNaN(cov) || cov <= 0) return setError("Coverage must be a positive number.");

    setBusy(true);
    try {
      const res = await fetch("/api/demo/issue-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyholder,
          coverageUsd: cov,
          ttlSeconds: Math.round((parseFloat(ttlHours) || 24) * 3600),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not issue code");
      setCode(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={s.page}>
      <style>{`
        *{box-sizing:border-box}
        .nion-input:focus{border-color:#F5A623 !important;box-shadow:0 0 0 3px rgba(245,166,35,0.15) !important}
        @media (max-width:640px){ .grid2{grid-template-columns:1fr !important} }
      `}</style>
      <div style={s.glow} />
      <div style={s.shell}>
        <nav style={s.nav}>
          <Link href="/" style={s.brand}>
            <Logo size={30} />
            <span style={s.brandText}>Nion</span>
          </Link>
          <Link href="/claim" style={s.back}>Go to claim →</Link>
        </nav>

        <div style={s.kicker}>Insurer console · demo</div>
        <h1 style={s.h1}>Issue a coverage code.</h1>
        <p style={s.sub}>
          This stands in for an insurer&apos;s backend. It signs a code that authorises
          Nion to release <em>up to</em> a set amount for one policyholder, once. Nion never
          receives a list of your policyholders — only this code, attached to a single claim.
        </p>

        <div style={s.card}>
          <div style={s.grid2} className="grid2">
            <div>
              <label style={s.label}>Policyholder wallet</label>
              <input style={s.input} className="nion-input" placeholder="0x…"
                value={policyholder} onChange={(e) => setPolicyholder(e.target.value.trim())} />
            </div>
            <div>
              <label style={s.label}>Coverage limit (USD)</label>
              <input style={s.input} className="nion-input"
                value={coverageUsd} onChange={(e) => setCoverageUsd(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Valid for (hours)</label>
              <input style={s.input} className="nion-input"
                value={ttlHours} onChange={(e) => setTtlHours(e.target.value)} />
            </div>
          </div>

          {error && <div style={s.error}>{error}</div>}

          <button style={{ ...s.submit, ...(busy ? s.busy : {}) }} onClick={issue} disabled={busy}>
            {busy ? "Signing…" : "Sign & issue code"}
          </button>

          {code && (
            <div style={{ marginTop: 22 }}>
              <label style={s.label}>Coverage code — give this to the policyholder</label>
              <pre style={s.code}>{code}</pre>
              <button
                style={s.copy}
                onClick={() => { navigator.clipboard.writeText(code); setCopied(true); }}
              >
                {copied ? "Copied ✓" : "Copy code"}
              </button>
              <p style={s.hint}>
                Paste it into the <Link href="/claim" style={{ color: "#F5A623" }}>claim form</Link>.
                The payout can never exceed this amount, and the code works exactly once.
              </p>
            </div>
          )}
        </div>

        <p style={s.foot}>
          Demo signer only. In production the insurer holds the signing key in their own
          backend — it is the single secret that authorises payouts.
        </p>
      </div>
    </main>
  );
}

const AMBER = "#F5A623";
const PAPER = "#F5EFE6";
const SAND = "#8A7E6B";

const s: Record<string, React.CSSProperties> = {
  page: { position: "relative", minHeight: "100vh", background: "#0A0906", color: PAPER, fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" },
  glow: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(720px 460px at 20% 0%, rgba(245,166,35,0.15), transparent 60%)" },
  shell: { position: "relative", zIndex: 2, maxWidth: 820, margin: "0 auto", padding: "0 clamp(18px,5vw,40px) clamp(56px,9vw,90px)" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "clamp(20px,4vw,28px) 0 clamp(28px,5vw,44px)" },
  brand: { display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: PAPER },
  brandText: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" },
  back: { color: SAND, textDecoration: "none", fontSize: 15.5, fontWeight: 500 },
  kicker: { fontSize: 13.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: AMBER, marginBottom: 14 },
  h1: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(32px,4.5vw,46px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 16 },
  sub: { fontSize: 17, color: "#C9BEAD", lineHeight: 1.6, marginBottom: 32, maxWidth: 620 },
  card: { background: "linear-gradient(180deg,#1B160C,#141109)", border: "1px solid rgba(138,126,107,0.2)", borderRadius: 22, padding: "clamp(20px,4.5vw,32px)", boxShadow: "0 40px 120px -50px rgba(0,0,0,0.9)" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  label: { display: "block", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: SAND, marginBottom: 7 },
  input: { width: "100%", padding: "11px 13px", background: "#0d0b06", border: "1px solid rgba(138,126,107,0.25)", borderRadius: 10, color: PAPER, fontSize: 16, outline: "none" },
  error: { marginTop: 16, padding: "11px 13px", borderRadius: 10, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", color: "#FFAD8A", fontSize: 14.5 },
  submit: { width: "100%", marginTop: 22, padding: 15, borderRadius: 12, border: "none", background: AMBER, color: "#1A1206", fontWeight: 700, fontSize: 16.5, cursor: "pointer" },
  busy: { background: "#3a2c12", color: "#d6b273", cursor: "default" },
  code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.6, color: "#9fe8d8", background: "#0d0b06", border: "1px solid rgba(61,220,151,0.2)", borderRadius: 12, padding: "16px 18px", overflowX: "auto", margin: 0 },
  copy: { marginTop: 12, padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(138,126,107,0.35)", background: "transparent", color: PAPER, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  hint: { fontSize: 14, color: SAND, marginTop: 12, lineHeight: 1.5 },
  foot: { fontSize: 13.5, color: SAND, marginTop: 28, lineHeight: 1.5 },
};
