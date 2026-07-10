"use client";

import { useEffect, useRef, useState } from "react";

const STAGES = [
  { label: "Peril verified", badge: "Storm confirmed · 153 km/h", tone: "green" as const },
  { label: "Damage analyzed", badge: "Damage 72%", tone: "amber" as const },
  { label: "Anchored on-chain", badge: "Hash written", tone: "amber" as const },
  { label: "Payout released", badge: "1,200 mUSDC sent", tone: "green" as const },
];

type Status = "pending" | "active" | "done";

export default function LiveDemo() {
  const [statuses, setStatuses] = useState<Status[]>(STAGES.map(() => "pending"));
  const [paid, setPaid] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function clearAll() {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }

    function run() {
      setStatuses(STAGES.map(() => "pending"));
      setPaid(false);

      if (reduce) {
        setStatuses(STAGES.map(() => "done"));
        setPaid(true);
        return;
      }

      let t = 600;
      STAGES.forEach((_, i) => {
        timers.current.push(
          setTimeout(() => setStatuses((s) => s.map((v, idx) => (idx === i ? "active" : v))), t)
        );
        t += 1100;
        timers.current.push(
          setTimeout(() => setStatuses((s) => s.map((v, idx) => (idx === i ? "done" : v))), t)
        );
        t += 350;
      });
      timers.current.push(setTimeout(() => setPaid(true), t + 100));
      timers.current.push(setTimeout(run, t + 4200));
    }

    run();
    return clearAll;
  }, []);

  const doneCount = statuses.filter((s) => s === "done").length;
  const progress = (doneCount / STAGES.length) * 100;

  return (
    <div style={st.card}>
      <div style={st.edge} />
      <div style={st.head}>
        <div style={st.title}>Disaster Triage · #TR-4471</div>
        <div style={st.live}>
          <span style={st.livePulse} />
          Live
        </div>
      </div>
      <div style={st.sub}>Flash flood · Tampa, FL · $2,000 coverage</div>

      <div style={st.trackBar}>
        <div style={{ ...st.trackFill, width: `${progress}%` }} />
      </div>

      {STAGES.map((stage, i) => {
        const status = statuses[i];
        const last = i === STAGES.length - 1;
        return (
          <div key={stage.label} style={st.stage}>
            <div style={st.rail}>
              <span
                style={{
                  ...st.node,
                  ...(status === "active" ? st.nodeActive : {}),
                  ...(status === "done" ? st.nodeDone : {}),
                }}
              >
                {status === "done" ? "✓" : status === "active" ? "" : i + 1}
              </span>
              {!last && <span style={{ ...st.conn, ...(status === "done" ? st.connDone : {}) }} />}
            </div>
            <div style={st.body}>
              <div style={{ ...st.lbl, ...(status === "pending" ? st.lblPending : {}) }}>
                {stage.label}
                {status === "active" && <span style={st.spin} />}
              </div>
              {status === "done" && (
                <span style={{ ...st.badge, ...(stage.tone === "green" ? st.badgeGreen : st.badgeAmber) }}>
                  {stage.badge}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {paid && <div style={st.payline}>Emergency relief settled on X Layer in 41 seconds.</div>}

      <style>{keyframes}</style>
    </div>
  );
}

const AMBER = "#F5A623";
const GREEN = "#3DDC97";
const PANEL = "#151109";
const SAND = "#8A7E6B";

const keyframes = `
  @keyframes nionPulseG{70%{box-shadow:0 0 0 6px rgba(61,220,151,0)}100%{box-shadow:0 0 0 0 rgba(61,220,151,0)}}
  @keyframes nionSpin{to{transform:rotate(360deg)}}
`;

const st: Record<string, React.CSSProperties> = {
  card: { position: "relative", background: "linear-gradient(180deg,#1B160C,#151109)", border: "1px solid rgba(138,126,107,0.18)", borderRadius: 20, padding: 22, boxShadow: "0 50px 130px -50px rgba(0,0,0,0.9), inset 0 1px 0 rgba(245,239,230,0.05)" },
  edge: { position: "absolute", inset: 0, borderRadius: 20, padding: 1, background: "linear-gradient(180deg,rgba(245,166,35,0.25),transparent 40%)", WebkitMask: "linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, position: "relative" },
  title: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15 },
  live: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: GREEN, fontWeight: 600 },
  livePulse: { width: 7, height: 7, borderRadius: "50%", background: GREEN, animation: "nionPulseG 1.4s infinite" },
  sub: { fontSize: 12.5, color: SAND, marginBottom: 16, position: "relative" },
  trackBar: { height: 3, background: "#241d10", borderRadius: 3, overflow: "hidden", marginBottom: 16, position: "relative" },
  trackFill: { height: "100%", background: AMBER, transition: "width .5s ease" },
  stage: { display: "flex", gap: 12, padding: "9px 0", position: "relative" },
  rail: { display: "flex", flexDirection: "column", alignItems: "center" },
  node: { width: 22, height: 22, borderRadius: "50%", border: "1.5px solid #33291a", color: SAND, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, background: PANEL, transition: "all .35s" },
  nodeActive: { borderColor: AMBER, color: AMBER, boxShadow: "0 0 0 4px rgba(245,166,35,0.12)" },
  nodeDone: { background: GREEN, borderColor: GREEN, color: "#08130d" },
  conn: { width: 2, flex: 1, minHeight: 14, background: "#241d10", margin: "2px 0", transition: "background .35s" },
  connDone: { background: GREEN },
  body: { flex: 1 },
  lbl: { fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 },
  lblPending: { color: "#5a4e3b", fontWeight: 500 },
  badge: { display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 },
  badgeAmber: { color: AMBER, background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)" },
  badgeGreen: { color: GREEN, background: "rgba(61,220,151,0.1)", border: "1px solid rgba(61,220,151,0.28)" },
  spin: { width: 11, height: 11, borderRadius: "50%", border: "2px solid rgba(245,166,35,0.25)", borderTopColor: AMBER, display: "inline-block", animation: "nionSpin .7s linear infinite" },
  payline: { marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(61,220,151,0.07)", border: "1px solid rgba(61,220,151,0.2)", fontSize: 13, color: "#9fe8d8", position: "relative" },
};
