"use client";

import { useEffect } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import LiveDemo from "@/components/LiveDemo";

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const STEPS = [
  { n: "01", title: "Oracle gateway", body: "Connect any real-world data source — weather, flight-radar, soil-moisture, river gauges. The Disaster Triage vault uses historical weather to confirm a peril occurred at the property's coordinates." },
  { n: "02", title: "Attestation", body: "The agent analyzes the event and writes a signed proof on X Layer. For triage, it scores the damage from the photo and anchors the fingerprint — a tamper-proof record no one can reuse." },
  { n: "03", title: "Vault factory", body: "Define the payout rule in code and deploy. The Disaster Triage vault runs: if verified damage clears the threshold, release emergency relief to the wallet, in the same minute." },
];

export default function Landing() {
  useReveal();

  return (
    <main style={s.page}>
      <div style={s.atmos} />
      <div style={s.clouds} />
      <div style={s.grain} />

      <div style={s.shell}>
        <nav style={s.nav}>
          <div style={s.brand}>
            <Logo size={32} />
            <span style={s.brandText}>Nion</span>
          </div>
          <div style={s.navRight}>
            <a href="#how" style={s.navLink}>How it works</a>
            <a href="#proof" style={s.navLink}>Proof</a>
            <span style={s.chain}>X Layer testnet · 1952</span>
          </div>
        </nav>

        <section style={s.hero} className="hero-grid">
          <div className="hero-copy" style={s.heroCopy}>
            <span style={s.eyebrow}>
              <span style={s.eyebrowDot} />
              Parametric payout protocol · live on X Layer
            </span>
            <h1 style={s.h1}>
              Parametric insurance, deployed in <span style={s.lit}>minutes</span>.
            </h1>
            <p style={s.lede}>
              Nion turns any verified real-world event into an instant on-chain
              payout. Connect an oracle, define a rule, deploy a vault. Disaster
              damage triage is the first vault, live today.
            </p>
            <div style={s.ctaRow}>
              <Link href="/claim" className="btn-primary" style={s.btnPrimary}>File a claim</Link>
              <a href="#how" className="btn-ghost" style={s.btnGhost}>See how it works</a>
            </div>
          </div>
          <div className="hero-demo">
            <LiveDemo />
          </div>
        </section>

        <section style={s.band} data-reveal>
          <div style={s.bandGrid}>
            <div>
              <div style={s.kicker}>The problem</div>
              <p style={s.bandText}>
                Parametric insurance pays out on a measurable trigger, not a
                months-long investigation. But building it means stitching together
                oracles, attestations, and payout logic from scratch, every time.
              </p>
            </div>
            <div>
              <div style={{ ...s.kicker, color: "#3DDC97" }}>What Nion is</div>
              <p style={s.bandText}>
                A protocol that turns that stack into infrastructure: a verified
                event becomes a signed on-chain attestation, and a vault releases
                funds against it automatically. Deploy once, settle forever.
              </p>
            </div>
          </div>
        </section>

        <section id="how" style={s.section}>
          <div style={s.sectionHead} data-reveal>
            <div style={s.kicker}>The architecture</div>
            <h2 style={s.h2}>Three layers. One protocol.</h2>
          </div>
          <div style={s.steps}>
            {STEPS.map((step) => (
              <div key={step.n} style={s.step} data-reveal>
                <div style={s.stepNum}>{step.n}</div>
                <div style={s.stepLine} />
                <div style={s.stepBody}>
                  <div style={s.stepTitle}>{step.title}</div>
                  <p style={s.stepText}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="proof" style={s.section}>
          <div style={s.proofCard} data-reveal>
            <div style={s.kicker}>Fraud-resistant by design</div>
            <h2 style={s.h2}>Every claim leaves a permanent record.</h2>
            <div style={s.proofGrid}>
              <Proof title="The event is verified" body="Payouts trigger only when independent weather records confirm severe conditions at the property's exact coordinates." />
              <Proof title="The photo is anchored" body="Each image's fingerprint is written to X Layer. Reusing a photo for a second claim is rejected by the contract itself." />
              <Proof title="Only the agent can settle" body="The payout function accepts calls from one trusted agent wallet. No one else can move funds." />
            </div>
          </div>
        </section>

        <section style={s.finalCta} data-reveal>
          <h2 style={s.h2}>See the first vault settle on-chain.</h2>
          <p style={s.appSub}>The Disaster Triage vault, prefilled with a real hurricane event so it runs end to end on testnet.</p>
          <Link href="/claim" className="btn-primary" style={{ ...s.btnPrimary, marginTop: 24 }}>File a claim</Link>
        </section>

        <footer style={s.footer}>
          <div style={s.brand}>
            <Logo size={24} />

          </div>
          <p style={s.footerNote}>
            Nion is a parametric payout protocol. Disaster Triage is the first
            vault — emergency triage, not final settlement. Testnet demo.
          </p>
        </footer>
      </div>

      <style>{css}</style>
    </main>
  );
}

function Proof({ title, body }: { title: string; body: string }) {
  return (
    <div style={s.proofItem}>
      <div style={s.proofCheck}>✓</div>
      <div style={s.proofTitle}>{title}</div>
      <p style={s.proofText}>{body}</p>
    </div>
  );
}

const AMBER = "#F5A623";
const GREEN = "#3DDC97";
const BLACK = "#0A0906";
const PANEL = "#141109";
const PAPER = "#F5EFE6";
const SAND = "#8A7E6B";

const css = `
  [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
  [data-reveal].in{opacity:1;transform:none}
  @keyframes nionPulse{70%{box-shadow:0 0 0 8px rgba(245,166,35,0)}100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}}
  html{scroll-behavior:smooth}
  .btn-primary{transition:transform .15s,box-shadow .35s}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 18px 50px -10px rgba(245,166,35,0.6) !important}
  .btn-ghost{transition:border-color .2s,background .2s}
  .btn-ghost:hover{border-color:${AMBER} !important;background:rgba(245,166,35,0.05) !important}
  .navlink:hover{color:${PAPER}}
  @media (max-width:920px){
    .hero-grid{grid-template-columns:1fr !important;gap:44px !important}
  }
  @media (prefers-reduced-motion:reduce){
    [data-reveal]{opacity:1;transform:none;transition:none}
    html{scroll-behavior:auto}
  }
`;

const s: Record<string, React.CSSProperties> = {
  page: { position: "relative", minHeight: "100vh", background: BLACK, color: PAPER, fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" },
  atmos: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(760px 480px at 78% 2%, rgba(245,166,35,0.20), transparent 58%), radial-gradient(560px 560px at 10% 92%, rgba(255,107,53,0.10), transparent 60%)" },
  clouds: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.35, background: "radial-gradient(1200px 300px at 60% -5%, rgba(40,30,15,0.9), transparent 70%), radial-gradient(900px 400px at 90% 20%, rgba(60,35,10,0.5), transparent 60%)" },
  grain: { position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.045, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" },
  shell: { position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", padding: "0 40px" },

  nav: { display: "flex", alignItems: "center", padding: "28px 0" },
  brand: { display: "flex", alignItems: "center", gap: 11 },
  brandText: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" },
  navRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 30 },
  navLink: { color: SAND, textDecoration: "none", fontSize: 15.5, fontWeight: 500 },
  chain: { fontSize: 13, color: SAND, border: "1px solid rgba(138,126,107,0.3)", padding: "6px 12px", borderRadius: 20, fontVariantNumeric: "tabular-nums" },

  hero: { display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center", padding: "70px 0 96px" },
  heroCopy: {},
  eyebrow: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: AMBER, marginBottom: 26, border: "1px solid rgba(245,166,35,0.25)", background: "rgba(245,166,35,0.06)", padding: "7px 14px", borderRadius: 30 },
  eyebrowDot: { width: 6, height: 6, borderRadius: "50%", background: AMBER, animation: "nionPulse 1.8s infinite" },
  h1: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(42px,5.2vw,64px)", fontWeight: 700, lineHeight: 1.03, letterSpacing: "-0.035em", marginBottom: 24 },
  lit: { color: AMBER },
  lede: { fontSize: "clamp(17px,1.4vw,20px)", color: "#C9BEAD", lineHeight: 1.62, maxWidth: 520, marginBottom: 36 },
  ctaRow: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  btnPrimary: { background: AMBER, color: "#1A1206", border: "none", padding: "16px 30px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em", textDecoration: "none", display: "inline-block", boxShadow: "0 8px 30px -10px rgba(245,166,35,0.4)" },
  btnGhost: { background: "transparent", color: PAPER, border: "1px solid rgba(138,126,107,0.35)", padding: "16px 26px", borderRadius: 12, fontSize: 15.5, fontWeight: 600, textDecoration: "none", display: "inline-block" },

  band: { padding: "56px 0", borderTop: "1px solid rgba(138,126,107,0.15)", borderBottom: "1px solid rgba(138,126,107,0.15)" },
  bandGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 },
  kicker: { fontSize: 13.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: AMBER, marginBottom: 14 },
  bandText: { fontSize: 18, lineHeight: 1.65, color: "#C9BEAD" },

  section: { padding: "88px 0" },
  sectionHead: { marginBottom: 48, maxWidth: 640 },
  h2: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(28px,3.5vw,40px)", fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.1 },

  steps: { display: "flex", flexDirection: "column" },
  step: { display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 22, paddingBottom: 34 },
  stepNum: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: AMBER, fontVariantNumeric: "tabular-nums", paddingTop: 2 },
  stepLine: { width: 1, background: "linear-gradient(to bottom, rgba(245,166,35,0.5), rgba(138,126,107,0.15))" },
  stepBody: { paddingBottom: 8 },
  stepTitle: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.01em" },
  stepText: { fontSize: 17, lineHeight: 1.6, color: "#B3A895", maxWidth: 560 },

  proofCard: { background: "linear-gradient(180deg,#181309,#141109)", border: "1px solid rgba(138,126,107,0.18)", borderRadius: 20, padding: "44px 40px", boxShadow: "0 40px 100px -50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(245,239,230,0.04)" },
  proofGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32, marginTop: 36 },
  proofItem: {},
  proofCheck: { width: 30, height: 30, borderRadius: "50%", background: "rgba(61,220,151,0.12)", border: "1px solid rgba(61,220,151,0.3)", color: GREEN, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, marginBottom: 16 },
  proofTitle: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 600, marginBottom: 8 },
  proofText: { fontSize: 16, lineHeight: 1.6, color: "#B3A895" },

  finalCta: { textAlign: "center", padding: "72px 0 96px", maxWidth: 560, margin: "0 auto" },
  appSub: { fontSize: 18, color: "#C9BEAD", lineHeight: 1.6, marginTop: 14 },

  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "40px 0 60px", borderTop: "1px solid rgba(138,126,107,0.15)", flexWrap: "wrap", gap: 16 },
  footerNote: { fontSize: 13.5, color: SAND, maxWidth: 460, lineHeight: 1.5, textAlign: "right" },
};
