"use client";

import { useState } from "react";
import Link from "next/link";
import FlowTracker, { FlowState, EMPTY_FLOW } from "@/components/FlowTracker";
import Logo from "@/components/Logo";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const PERILS = ["Flash Flood", "Flood", "Hurricane", "Tornado", "Windstorm"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

const FLOW_SUMMARY = [
  { n: "01", t: "Peril verified against weather records" },
  { n: "02", t: "Damage scored from your photo" },
  { n: "03", t: "Evidence anchored on X Layer" },
  { n: "04", t: "Emergency relief sent to your wallet" },
];

export default function ClaimPage() {
  const [wallet, setWallet] = useState("");
  const [address, setAddress] = useState("14 Marine Rd, Port Harcourt");
  const [lat, setLat] = useState("27.9506");
  const [lng, setLng] = useState("-82.4572");
  const [policyNo, setPolicyNo] = useState("PH-2291-ASP");
  const [coverage, setCoverage] = useState("2000");
  const [deductible, setDeductible] = useState("100");
  const [incidentDate, setIncidentDate] = useState("2024-10-09");
  const [peril, setPeril] = useState("Hurricane");
  const [photo, setPhoto] = useState<File | null>(null);

  const [flow, setFlow] = useState<FlowState>(EMPTY_FLOW);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = Object.values(flow).some((v) => v.status !== "pending");

  function patch(stage: keyof FlowState, next: Partial<FlowState[keyof FlowState]>) {
    setFlow((f) => ({ ...f, [stage]: { ...f[stage], ...next } }));
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setError("MetaMask not found. Install it to file a claim.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0]);
      setError(null);
    } catch {
      setError("Wallet connection was declined.");
    }
  }

  function disconnectWallet() {
    setWallet("");
  }

  async function submitClaim() {
    setError(null);
    if (!wallet) return setError("Connect your wallet first.");
    if (!photo) return setError("Upload a photo of the damage.");
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    const coverageN = parseFloat(coverage);
    const deductibleN = parseFloat(deductible) || 0;
    if (isNaN(latN) || isNaN(lngN)) return setError("Coordinates are invalid.");
    if (isNaN(coverageN)) return setError("Coverage limit is invalid.");

    setRunning(true);
    setFlow(EMPTY_FLOW);
    setTrackerOpen(true);

    try {
      patch("sign", { status: "active" });
      const message = `Nion claim\nProperty: ${address}\nPolicy: ${policyNo}\nPeril: ${peril}\nDate: ${incidentDate}`;
      await window.ethereum.request({ method: "personal_sign", params: [message, wallet] });
      patch("sign", { status: "done", meta: "signed" });

      patch("weather", { status: "active" });
      const wRes = await fetch("/api/verify-weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: latN, longitude: lngN, incidentDate, perilType: peril }),
      });
      const wData = await wRes.json();
      if (!wRes.ok) throw new Error(wData.error || "Weather check failed");
      if (!wData.stormConfirmed) {
        patch("weather", { status: "failed", badge: "No peril on record", meta: wData.summary });
        throw new Error("No severe weather confirmed at this location and date.");
      }
      patch("weather", { status: "done", badge: "Peril confirmed", meta: `gusts ${wData.windGustKmh} km/h - ${wData.precipitationMm} mm` });

      patch("vision", { status: "active" });
      const imageBase64 = await fileToBase64(photo);
      const vRes = await fetch("/api/analyze-damage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: photo.type }),
      });
      const vData = await vRes.json();
      if (!vRes.ok) throw new Error(vData.error || "Damage analysis failed");
      const score: number = vData.damageScore;
      patch("vision", { status: "done", badge: `Damage ${score}%`, meta: vData.observations?.notes || "" });

      patch("anchor", { status: "active" });
      patch("payout", { status: "active" });
      const sRes = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyholder: wallet,
          imageBase64,
          damageScore: score,
          coverageLimitUsd: coverageN,
          deductibleUsd: deductibleN,
        }),
      });
      const sData = await sRes.json();
      if (!sRes.ok) throw new Error(sData.error || "Settlement failed");

      patch("anchor", { status: "done", badge: "Hash written", meta: "view tx", tx: sData.txHash });

      const paidUsd = Number(sData.payoutAmount) / 1_000_000;
      if (sData.paid && paidUsd > 0) {
        patch("payout", { status: "done", badge: `${paidUsd.toLocaleString()} mUSDC sent`, meta: "view tx", tx: sData.txHash });
      } else {
        patch("payout", { status: "failed", badge: "Below threshold", meta: "No payout released" });
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setFlow((f) => {
        const copy = { ...f };
        (Object.keys(copy) as (keyof FlowState)[]).forEach((k) => {
          if (copy[k].status === "active") copy[k] = { ...copy[k], status: "failed" };
        });
        return copy;
      });
    } finally {
      setRunning(false);
    }
  }

  const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <main style={s.page}>
      <style>{`
        *{box-sizing:border-box}
        /* Stack the two-column page layout on tablets, but keep the form grid 2-up */
        @media (max-width: 860px) {
          .claim-layout { grid-template-columns: 1fr !important; gap: clamp(32px,6vw,40px) !important; }
          .claim-left { position: static !important; }
        }
        /* Phones: single-column form + full-width wallet button */
        @media (max-width: 560px) {
          .claim-grid2 { grid-template-columns: 1fr !important; }
          .claim-wallet-row { align-items: stretch !important; }
          .claim-connect { width: 100%; text-align: center; }
        }
      `}</style>
      {/* nion-claim-css */}
      <style>{`
        .nion-input:focus{border-color:#F5A623 !important;box-shadow:0 0 0 3px rgba(245,166,35,0.15) !important}
        .nion-submit{transition:transform .15s,box-shadow .35s}
        .nion-submit:hover{transform:translateY(-1px);box-shadow:0 16px 44px -12px rgba(245,166,35,0.5)}
        .nion-connect{transition:background .2s,border-color .2s}
        .nion-connect:hover{background:rgba(245,166,35,0.08)}
      `}</style>
      <div style={s.glow} />
      <div style={s.grain} />

      <div style={s.shell}>
        <nav style={s.nav}>
          <Link href="/" style={s.brand}>
            <Logo size={30} />
            <span style={s.brandText}>Nion</span>
          </Link>
          <Link href="/" style={s.back}>Back</Link>
        </nav>

        <div style={s.layout} className="claim-layout">
          <aside style={s.left} className="claim-left">
            <div style={s.kicker}>Disaster Triage vault</div>
            <h1 style={s.h1}>File a claim on the Triage vault.</h1>
            <p style={s.sub}>
              The first vault on Nion. Prefilled with a real hurricane event so
              it runs end to end on X Layer testnet.
            </p>

            <div style={s.flowList}>
              {FLOW_SUMMARY.map((f) => (
                <div key={f.n} style={s.flowItem}>
                  <span style={s.flowNum}>{f.n}</span>
                  <span style={s.flowText}>{f.t}</span>
                </div>
              ))}
            </div>

            <div style={s.leftNote}>
              Parametric emergency triage, not final settlement. Severity determines
              the released fraction of your coverage.
            </div>
          </aside>

          <div style={s.card}>
            <div style={s.walletRow} className="claim-wallet-row">
              <label style={s.label}>Policyholder wallet</label>
              {wallet ? (
                <div style={s.walletConnected}>
                  <span style={s.walletDot} />
                  {short(wallet)}
                  <button style={s.disconnect} onClick={disconnectWallet} aria-label="Disconnect wallet">Disconnect</button>
                </div>
              ) : (
                <button style={s.connectBtn} className="nion-connect claim-connect" onClick={connectWallet}>Connect MetaMask</button>
              )}
            </div>

            <div style={s.grid2} className="claim-grid2">
              <Field label="Property address"><input style={s.input} className="nion-input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
              <Field label="Policy number"><input style={s.input} className="nion-input" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} /></Field>
              <Field label="Latitude"><input style={s.input} className="nion-input" value={lat} onChange={(e) => setLat(e.target.value)} /></Field>
              <Field label="Longitude"><input style={s.input} className="nion-input" value={lng} onChange={(e) => setLng(e.target.value)} /></Field>
              <Field label="Incident date"><input style={s.input} className="nion-input" type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} /></Field>
              <Field label="Type of peril">
                <select style={s.input} className="nion-input" value={peril} onChange={(e) => setPeril(e.target.value)}>
                  {PERILS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Coverage limit (USD)"><input style={s.input} className="nion-input" value={coverage} onChange={(e) => setCoverage(e.target.value)} /></Field>
              <Field label="Deductible (USD)"><input style={s.input} className="nion-input" value={deductible} onChange={(e) => setDeductible(e.target.value)} /></Field>
            </div>

            <div style={{ marginTop: 18 }}>
              <label style={s.label}>Damage photo</label>
              <input style={s.file} type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              {photo && <div style={s.fileName}>{photo.name}</div>}
            </div>

            {error && <div style={s.error}>{error}</div>}

            <button style={{ ...s.submit, ...(running ? s.submitBusy : {}) }} className="nion-submit" onClick={submitClaim} disabled={running}>
              {running ? "Processing claim..." : "Sign & submit claim"}
            </button>
            <p style={s.hint}>Signing opens the claim tracker in the corner. It never covers this screen.</p>
          </div>
        </div>
      </div>

      {started && (
        <FlowTracker flow={flow} open={trackerOpen} onToggle={() => setTrackerOpen((o) => !o)} />
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

const AMBER = "#F5A623";
const GREEN = "#3DDC97";
const BLACK = "#0A0906";
const PANEL = "#141109";
const PAPER = "#F5EFE6";
const SAND = "#8A7E6B";

const s: Record<string, React.CSSProperties> = {
  page: { position: "relative", minHeight: "100vh", background: BLACK, color: PAPER, fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" },
  glow: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(720px 460px at 20% 0%, rgba(245,166,35,0.15), transparent 60%), radial-gradient(520px 520px at 95% 90%, rgba(255,107,53,0.08), transparent 60%)" },
  grain: { position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.05, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" },
  shell: { position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: "0 clamp(18px,5vw,40px) clamp(56px,9vw,90px)" },

  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "clamp(20px,4vw,28px) 0 clamp(32px,6vw,56px)" },
  brand: { display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: PAPER },
  brandText: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" },
  back: { color: SAND, textDecoration: "none", fontSize: 15.5, fontWeight: 500 },

  layout: { display: "grid", gridTemplateColumns: "minmax(0, 0.85fr) minmax(0, 1.15fr)", gap: "clamp(36px,5vw,64px)", alignItems: "start" },

  left: { position: "sticky", top: 40 },
  kicker: { fontSize: 13.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: AMBER, marginBottom: 18 },
  h1: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(38px,5vw,56px)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.02, marginBottom: 20 },
  sub: { fontSize: 18, color: "#C9BEAD", lineHeight: 1.6, marginBottom: 36, maxWidth: 400 },
  flowList: { display: "flex", flexDirection: "column", gap: 16, marginBottom: 36 },
  flowItem: { display: "flex", alignItems: "baseline", gap: 14 },
  flowNum: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: AMBER, fontVariantNumeric: "tabular-nums", minWidth: 20 },
  flowText: { fontSize: 16.5, color: "#B3A895", lineHeight: 1.4 },
  leftNote: { fontSize: 14.5, color: SAND, lineHeight: 1.55, maxWidth: 380, borderTop: "1px solid rgba(138,126,107,0.2)", paddingTop: 20 },

  card: { background: "linear-gradient(180deg,#1B160C,#141109)", border: "1px solid rgba(138,126,107,0.2)", borderRadius: 22, padding: "clamp(20px,4.5vw,32px)", boxShadow: "0 40px 120px -50px rgba(0,0,0,0.9), inset 0 1px 0 rgba(245,239,230,0.05)" },
  walletRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  walletConnected: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 14px", borderRadius: 30, border: "1px solid rgba(61,220,151,0.3)", background: "rgba(61,220,151,0.08)", color: GREEN, fontWeight: 600, fontSize: 14.5, fontVariantNumeric: "tabular-nums" },
  walletDot: { width: 7, height: 7, borderRadius: "50%", background: GREEN },
  disconnect: { marginLeft: 4, background: "transparent", border: "1px solid rgba(138,126,107,0.35)", color: SAND, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, cursor: "pointer" },
  connectBtn: { padding: "11px 20px", borderRadius: 10, border: `1px solid ${AMBER}`, background: "transparent", color: AMBER, fontWeight: 600, fontSize: 15, cursor: "pointer" },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  label: { display: "block", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", color: SAND, marginBottom: 7 },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 13px", background: "#0d0b06", border: "1px solid rgba(138,126,107,0.25)", borderRadius: 10, color: PAPER, fontSize: 16, outline: "none" },
  file: { width: "100%", boxSizing: "border-box", padding: "11px 13px", background: "#0d0b06", border: "1px dashed rgba(138,126,107,0.35)", borderRadius: 10, color: SAND, fontSize: 15 },
  fileName: { fontSize: 14, color: AMBER, marginTop: 6 },
  error: { marginTop: 16, padding: "11px 13px", borderRadius: 10, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", color: "#FFAD8A", fontSize: 14.5, lineHeight: 1.5 },
  submit: { width: "100%", marginTop: 22, padding: "15px", borderRadius: 12, border: "none", background: AMBER, color: "#1A1206", fontWeight: 700, fontSize: 16.5, cursor: "pointer", letterSpacing: "-0.01em" },
  submitBusy: { background: "#3a2c12", color: "#d6b273", cursor: "default" },
  hint: { fontSize: 14, color: SAND, marginTop: 12, textAlign: "center" },
};
