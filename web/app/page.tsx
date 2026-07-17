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
  { n: "01", title: "Verify the peril", body: "Nion checks the property's exact coordinates and incident date against four independent oracles — weather (Open-Meteo), wildfire (NASA FIRMS), earthquake and river gauges (USGS). If no source confirms the event, the claim stops here — it has to be independently real." },
  { n: "02", title: "Score the damage", body: "A vision model reports what it observes in the photo: missing roof covering, exposed decking, structural collapse, debris, water damage. Nion derives the damage score from those facts — the model never guesses a number." },
  { n: "03", title: "Anchor the evidence", body: "The photo's fingerprint is written permanently to X Layer. The same image can never be submitted for a second claim — the contract itself rejects it." },
  { n: "04", title: "Release the first tranche", body: "If verified damage clears the threshold, the contract releases an emergency payout — a fraction of the coverage limit, sized by severity — straight to the policyholder's wallet. Final claim settlement stays with the insurer; Nion solves the speed problem for the money people need now." },
];

export default function Landing() {
  useReveal();

  return (
    <main style={s.page}>
      <div style={s.atmos} />
      <div style={s.clouds} />
      <div style={s.grain} />

      <div style={s.shell}>
        <nav style={s.nav} className="site-nav">
          <div style={s.brand}>
            <Logo size={32} />
            <span style={s.brandText}>Nion</span>
          </div>
          <div style={s.navRight} className="nav-right">
            <a href="#how" style={s.navLink}>How it works</a>
            <a href="#proof" style={s.navLink}>Proof</a>
            <a href="#api" style={s.navLink}>API</a>
            <span style={s.chain} className="chain-chip">X Layer testnet · 1952</span>
          </div>
        </nav>

        <section style={s.hero} className="hero-grid">
          <div className="hero-copy" style={s.heroCopy}>
            <span style={s.eyebrow}>
              <span style={s.eyebrowDot} />
              Autonomous claims agent · ASP #5013 on OKX.AI
            </span>
            <h1 style={s.h1}>
              Emergency payouts in <span style={s.lit}>minutes</span>, not weeks.
            </h1>
            <p style={s.lede}>
              Nion is an autonomous claims agent that insurers and other agents hire through a single endpoint. A claims system hands it a damage photo and a location; it verifies the peril, scores the damage, anchors the evidence on X Layer, and releases the emergency first tranche to the policyholder&apos;s wallet — machine to machine. Not final settlement, the fast relief that today takes months.
            </p>
            <div style={s.ctaRow} className="cta-row">
              <Link href="/claim" className="btn-primary" style={s.btnPrimary}>Run the live demo</Link>
              <a href="#api" className="btn-ghost" style={s.btnGhost}>See the API</a>
            </div>
          </div>
          <div className="hero-demo">
            <LiveDemo />
          </div>
        </section>

        <section style={s.band} data-reveal>
          <div style={s.bandGrid} className="band-grid">
            <div>
              <div style={s.kicker}>The problem</div>
              <p style={s.bandText}>
                After a disaster, property claims take months. Insurers can&apos;t
                staff the surge — thousands of damage photos sit in a queue while
                families who need emergency relief now get nothing.
              </p>
            </div>
            <div>
              <div style={{ ...s.kicker, color: "#3DDC97" }}>What Nion is</div>
              <p style={s.bandText}>
                A service that triages a claim the moment it arrives — and pays.
                It confirms the event really happened, reads the damage from the
                photo, records tamper-proof evidence on-chain, and settles the
                emergency tranche in the same minute.
              </p>
            </div>
          </div>
        </section>

        <section id="how" style={s.section}>
          <div style={s.sectionHead} data-reveal>
            <div style={s.kicker}>How it works</div>
            <h2 style={s.h2}>Four steps. One autonomous pass.</h2>
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
            <div style={s.proofGrid} className="proof-grid">
              <Proof title="The event is verified" body="Payouts trigger only when independent oracles — weather, wildfire, earthquake, or river gauges — confirm the peril at the property's exact coordinates." />
              <Proof title="The photo is anchored" body="Each image's fingerprint is written to X Layer. Reusing a photo for a second claim is rejected by the contract itself." />
              <Proof title="Only the agent can settle" body="The payout function accepts calls from one trusted agent wallet. No one else can move funds." />
            </div>
          </div>
        </section>

        <section id="api" style={s.section}>
          <div style={s.sectionHead} data-reveal>
            <div style={s.kicker}>Hire the agent</div>
            <h2 style={s.h2}>One call. Any agent.</h2>
            <p style={s.appSub}>
              This is the product. An insurer&apos;s claims system loops its backlog through one endpoint — each call returns a verdict and an on-chain payout: the emergency tranche, not final settlement. Call it in verify-only mode to just confirm a peril, and fund payouts from a shared pool or the caller&apos;s own vault. The web form below is a window into the same agent. Registered on the OKX.AI marketplace as ASP #5013.
            </p>
          </div>
          <div style={s.codeCard} className="code-card" data-reveal>
            <div style={s.codeHead}>
              <span style={s.codeMethod}>POST</span>
              <span style={s.codePath}>/api/triage</span>
            </div>
            <pre style={s.code}>{`{
  "policyholder":     "0x9407…d38D",
  "latitude":         27.9506,
  "longitude":        -82.4572,
  "incidentDate":     "2024-10-09",
  "perilType":        "Hurricane",
  "coverageLimitUsd": 2000,
  "imageBase64":      "…"
}`}</pre>
            <div style={s.codeArrow}>↓</div>
            <pre style={{ ...s.code, ...s.codeOut }}>{`{
  "verdict":      "paid",
  "damageScore":  65,
  "payoutUsd":    1100,
  "txHash":       "0xa989…d39e",
  "explorerUrl":  "https://…"
}`}</pre>
          </div>
        </section>

        <section style={s.finalCta} data-reveal>
          <h2 style={s.h2}>See a claim settle on-chain.</h2>
          <p style={s.appSub}>Prefilled with a real hurricane event so it runs end to end on X Layer testnet.</p>
          <Link href="/claim" className="btn-primary" style={{ ...s.btnPrimary, marginTop: 24 }}>Run the live demo</Link>
        </section>

        <footer style={s.footer} className="site-footer">
          <div style={s.brand}>
            <Logo size={24} />
            <span style={{ ...s.brandText, fontSize: 15 }}>Nion</span>
          </div>
          <p style={s.footerNote}>
            Parametric emergency triage — not final claim settlement. Testnet demo on X Layer: the payout pool is pre-funded to demonstrate the flow and stands in for an insurer&apos;s coverage float. Per-insurer funded pools are the next contract iteration.
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
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  section[id]{scroll-margin-top:84px}
  [data-reveal]{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
  [data-reveal].in{opacity:1;transform:none}
  @keyframes nionPulse{70%{box-shadow:0 0 0 8px rgba(245,166,35,0)}100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}}
  .btn-primary{transition:transform .15s,box-shadow .35s}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 18px 50px -10px rgba(245,166,35,0.6) !important}
  .btn-ghost{transition:border-color .2s,background .2s}
  .btn-ghost:hover{border-color:${AMBER} !important;background:rgba(245,166,35,0.05) !important}
  .site-nav a{transition:color .2s}
  .site-nav a:hover{color:${PAPER}}

  /* Tablet */
  @media (max-width:920px){
    .hero-grid{grid-template-columns:1fr !important;gap:clamp(36px,6vw,44px) !important}
    .proof-grid{grid-template-columns:1fr 1fr !important}
  }

  /* Small tablet / large phone */
  @media (max-width:640px){
    .site-nav{flex-wrap:wrap;gap:12px}
    .nav-right{margin-left:0 !important;width:100%;justify-content:space-between;gap:14px !important;font-size:14px}
    .band-grid{grid-template-columns:1fr !important;gap:28px !important}
    .proof-grid{grid-template-columns:1fr !important}
    .code-card pre{font-size:11.5px !important}
    .site-footer{flex-direction:column;align-items:flex-start !important}
    .site-footer p{text-align:left !important;max-width:100% !important}
  }

  /* Phone: full-width tap targets, hide the chain chip to save the row */
  @media (max-width:480px){
    .cta-row{flex-direction:column;align-items:stretch !important}
    .cta-row a{width:100%;text-align:center}
    .chain-chip{display:none !important}
    .nav-right{justify-content:flex-start}
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
  shell: { position: "relative", zIndex: 2, maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px)" },

  nav: { display: "flex", alignItems: "center", padding: "clamp(14px,2.4vw,20px) clamp(20px,5vw,40px)", margin: "0 calc(-1 * clamp(20px,5vw,40px))", position: "sticky", top: 0, zIndex: 30, background: "rgba(10,9,6,0.72)", backdropFilter: "saturate(140%) blur(14px)", WebkitBackdropFilter: "saturate(140%) blur(14px)", borderBottom: "1px solid rgba(138,126,107,0.14)" },
  brand: { display: "flex", alignItems: "center", gap: 11 },
  brandText: { fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em" },
  navRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 30 },
  navLink: { color: SAND, textDecoration: "none", fontSize: 15.5, fontWeight: 500 },
  chain: { fontSize: 13, color: SAND, border: "1px solid rgba(138,126,107,0.3)", padding: "6px 12px", borderRadius: 20, fontVariantNumeric: "tabular-nums" },

  hero: { display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "clamp(40px,5vw,56px)", alignItems: "center", padding: "clamp(36px,6vw,70px) 0 clamp(56px,9vw,96px)" },
  heroCopy: {},
  eyebrow: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: AMBER, marginBottom: 26, border: "1px solid rgba(245,166,35,0.25)", background: "rgba(245,166,35,0.06)", padding: "7px 14px", borderRadius: 30 },
  eyebrowDot: { width: 6, height: 6, borderRadius: "50%", background: AMBER, animation: "nionPulse 1.8s infinite" },
  h1: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(42px,5.2vw,64px)", fontWeight: 700, lineHeight: 1.03, letterSpacing: "-0.035em", marginBottom: 24 },
  lit: { color: AMBER },
  lede: { fontSize: "clamp(17px,1.4vw,20px)", color: "#C9BEAD", lineHeight: 1.62, maxWidth: 520, marginBottom: 36 },
  ctaRow: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  btnPrimary: { background: AMBER, color: "#1A1206", border: "none", padding: "16px 30px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em", textDecoration: "none", display: "inline-block", boxShadow: "0 8px 30px -10px rgba(245,166,35,0.4)" },
  btnGhost: { background: "transparent", color: PAPER, border: "1px solid rgba(138,126,107,0.35)", padding: "16px 26px", borderRadius: 12, fontSize: 15.5, fontWeight: 600, textDecoration: "none", display: "inline-block" },

  band: { padding: "clamp(40px,7vw,56px) 0", borderTop: "1px solid rgba(138,126,107,0.15)", borderBottom: "1px solid rgba(138,126,107,0.15)" },
  bandGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(28px,4vw,48px)" },
  kicker: { fontSize: 13.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: AMBER, marginBottom: 14 },
  bandText: { fontSize: 18, lineHeight: 1.65, color: "#C9BEAD" },

  section: { padding: "clamp(52px,9vw,88px) 0" },
  sectionHead: { marginBottom: "clamp(32px,5vw,48px)", maxWidth: 640 },
  h2: { fontFamily: "'Space Grotesk',sans-serif", fontSize: "clamp(28px,3.5vw,40px)", fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.1 },

  steps: { display: "flex", flexDirection: "column" },
  step: { display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 22, paddingBottom: 34 },
  stepNum: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: AMBER, fontVariantNumeric: "tabular-nums", paddingTop: 2 },
  stepLine: { width: 1, background: "linear-gradient(to bottom, rgba(245,166,35,0.5), rgba(138,126,107,0.15))" },
  stepBody: { paddingBottom: 8 },
  stepTitle: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, marginBottom: 8, letterSpacing: "-0.01em" },
  stepText: { fontSize: 17, lineHeight: 1.6, color: "#B3A895", maxWidth: 560 },

  proofCard: { background: "linear-gradient(180deg,#181309,#141109)", border: "1px solid rgba(138,126,107,0.18)", borderRadius: 20, padding: "clamp(26px,4.5vw,44px) clamp(22px,4vw,40px)", boxShadow: "0 40px 100px -50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(245,239,230,0.04)" },
  proofGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "clamp(24px,3vw,32px)", marginTop: 36 },
  proofItem: {},
  proofCheck: { width: 30, height: 30, borderRadius: "50%", background: "rgba(61,220,151,0.12)", border: "1px solid rgba(61,220,151,0.3)", color: GREEN, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, marginBottom: 16 },
  proofTitle: { fontFamily: "'Space Grotesk',sans-serif", fontSize: 19, fontWeight: 600, marginBottom: 8 },
  proofText: { fontSize: 16, lineHeight: 1.6, color: "#B3A895" },

  codeCard: { background: "linear-gradient(180deg,#181309,#141109)", border: "1px solid rgba(138,126,107,0.18)", borderRadius: 20, padding: "clamp(20px,4vw,28px)", boxShadow: "0 40px 100px -50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(245,239,230,0.04)" },
  codeHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 },
  codeMethod: { fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#0A0906", background: AMBER, padding: "4px 10px", borderRadius: 6 },
  codePath: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 15, color: PAPER },
  code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, lineHeight: 1.7, color: "#B3A895", background: "#0d0b06", border: "1px solid rgba(138,126,107,0.15)", borderRadius: 12, padding: "18px 20px", overflowX: "auto", margin: 0 },
  codeOut: { color: "#9fe8d8", borderColor: "rgba(61,220,151,0.2)", background: "rgba(61,220,151,0.04)" },
  codeArrow: { textAlign: "center", color: AMBER, fontSize: 18, padding: "12px 0" },
  finalCta: { textAlign: "center", padding: "clamp(48px,8vw,72px) 0 clamp(60px,9vw,96px)", maxWidth: 560, margin: "0 auto" },
  appSub: { fontSize: 18, color: "#C9BEAD", lineHeight: 1.6, marginTop: 14 },

  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "40px 0 60px", borderTop: "1px solid rgba(138,126,107,0.15)", flexWrap: "wrap", gap: 16 },
  footerNote: { fontSize: 13.5, color: SAND, maxWidth: 460, lineHeight: 1.5, textAlign: "right" },
};
