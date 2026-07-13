"use client";

// ── Disaster Damage Triage Oracle — Post-Signature Flow Tracker ──────────────
// Non-blocking, corner-docked. Driven by REAL stage data passed as props from
// the claim form. Collapsed = a pill; expanded = a panel that never covers the
// viewport centre. Judges tap it to watch the claim settle, then collapse it.

export type StageStatus = "pending" | "active" | "done" | "failed";

export interface StageState {
  status: StageStatus;
  badge?: string; // short result chip, e.g. "Damage 72%"
  meta?: string; // secondary text, e.g. a wallet or gust figure
  tx?: string; // tx hash -> renders an explorer link
}

export interface FlowState {
  sign: StageState;
  weather: StageState;
  vision: StageState;
  anchor: StageState;
  payout: StageState;
}

export const EMPTY_FLOW: FlowState = {
  sign: { status: "pending" },
  weather: { status: "pending" },
  vision: { status: "pending" },
  anchor: { status: "pending" },
  payout: { status: "pending" },
};

const STAGES: { id: keyof FlowState; label: string; detail: string }[] = [
  {
    id: "sign",
    label: "Attestation signed",
    detail: "Policyholder signed the claim with their wallet.",
  },
  {
    id: "weather",
    label: "Peril verified",
    detail: "Historical weather records checked against the incident.",
  },
  {
    id: "vision",
    label: "Damage analyzed",
    detail: "Vision model scored structural damage from the photo.",
  },
  {
    id: "anchor",
    label: "Anchored onchain",
    detail: "Photo hash written to X Layer — blocks re-use of this image.",
  },
  {
    id: "payout",
    label: "Payout released",
    detail: "Emergency stablecoin sent to the policyholder wallet.",
  },
];

const EXPLORER = "https://www.okx.com/web3/explorer/xlayer-test/tx/";

export default function FlowTracker({
  flow,
  open,
  onToggle,
}: {
  flow: FlowState;
  open: boolean;
  onToggle: () => void;
}) {
  const done = STAGES.filter((s) => flow[s.id].status === "done").length;
  const anyFailed = STAGES.some((s) => flow[s.id].status === "failed");
  const allDone = done === STAGES.length;
  const progress = Math.round((done / STAGES.length) * 100);
  const active = !allDone && !anyFailed;

  let pillText: string;
  if (anyFailed) pillText = "Claim halted";
  else if (allDone) pillText = "Payout complete";
  else pillText = `Processing… ${progress}%`;

  return (
    <div style={styles.dockWrap}>
      {open ? (
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <div>
              <div style={styles.panelTitle}>Claim flow</div>
              <div style={styles.panelSub}>
                {anyFailed
                  ? "Stopped"
                  : allDone
                  ? "Funds delivered"
                  : "Live · agent processing"}
              </div>
            </div>
            <button style={styles.collapseBtn} onClick={onToggle} aria-label="Collapse tracker">
              ▾
            </button>
          </div>

          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress}%`,
                background: anyFailed ? "#F5735E" : ACCENT,
              }}
            />
          </div>

          <div style={styles.steps}>
            {STAGES.map((stage, i) => {
              const st = flow[stage.id];
              const isDone = st.status === "done";
              const isActive = st.status === "active";
              const isFailed = st.status === "failed";
              const isPending = st.status === "pending";
              return (
                <div key={stage.id} style={styles.step}>
                  <div style={styles.stepRail}>
                    <span
                      style={{
                        ...styles.node,
                        ...(isDone ? styles.nodeDone : {}),
                        ...(isActive ? styles.nodeActive : {}),
                        ...(isFailed ? styles.nodeFailed : {}),
                      }}
                    >
                      {isDone ? "✓" : isFailed ? "×" : isActive ? "" : i + 1}
                    </span>
                    {i < STAGES.length - 1 && (
                      <span
                        style={{
                          ...styles.connector,
                          ...(isDone ? styles.connectorDone : {}),
                        }}
                      />
                    )}
                  </div>
                  <div style={styles.stepBody}>
                    <div
                      style={{
                        ...styles.stepLabel,
                        ...(isPending ? styles.stepLabelPending : {}),
                        ...(isFailed ? styles.stepLabelFailed : {}),
                      }}
                    >
                      {stage.label}
                      {isActive && <span style={styles.spinner} />}
                    </div>
                    {(isDone || isActive || isFailed) && (
                      <div style={styles.stepDetail}>{stage.detail}</div>
                    )}
                    {(isDone || isFailed) && (st.badge || st.meta || st.tx) && (
                      <div style={styles.stepResult}>
                        {st.badge && (
                          <span
                            style={{
                              ...styles.resultBadge,
                              ...(isFailed ? styles.resultBadgeFailed : {}),
                            }}
                          >
                            {st.badge}
                          </span>
                        )}
                        {st.tx ? (
                          <a
                            href={EXPLORER + st.tx}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.resultLink}
                          >
                            {st.meta || "view tx"} ↗
                          </a>
                        ) : (
                          st.meta && <span style={styles.resultMeta}>{st.meta}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {allDone && (
            <div style={styles.doneBanner}>
              Emergency relief settled on X Layer in under a minute.
            </div>
          )}
        </div>
      ) : (
        <button style={styles.pill} onClick={onToggle}>
          <span
            style={{
              ...styles.pillDot,
              ...(anyFailed
                ? styles.dotFailed
                : allDone
                ? styles.dotDone
                : styles.dotLive),
            }}
          />
          {pillText}
          <span style={styles.pillChevron}>▴</span>
        </button>
      )}
    </div>
  );
}

const ACCENT = "#00E0B8";
const INK = "#0B1220";
const PAPER = "#0F1826";

const styles: Record<string, React.CSSProperties> = {
  dockWrap: {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 50,
    maxWidth: "calc(100vw - 40px)",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: PAPER,
    color: "#E6EDF6",
    border: "1px solid #22344d",
    padding: "11px 16px",
    borderRadius: 30,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 12px 40px -12px rgba(0,0,0,0.7)",
    fontVariantNumeric: "tabular-nums",
  },
  pillDot: { width: 8, height: 8, borderRadius: "50%" },
  dotLive: { background: ACCENT, animation: "tftpulse 1.6s infinite" },
  dotDone: { background: ACCENT },
  dotFailed: { background: "#F5735E" },
  pillChevron: { color: "#6B7C93", fontSize: 11, marginLeft: 2 },
  panel: {
    width: "min(340px, calc(100vw - 40px))",
    background: PAPER,
    border: "1px solid #22344d",
    borderRadius: 16,
    boxShadow: "0 24px 70px -20px rgba(0,0,0,0.75)",
    overflow: "hidden",
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px 18px 13px",
    borderBottom: "1px solid #1a2840",
  },
  panelTitle: { fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" },
  panelSub: { fontSize: 12, color: ACCENT, marginTop: 2 },
  collapseBtn: {
    background: "transparent",
    border: "1px solid #22344d",
    color: "#8A9AB0",
    width: 28,
    height: 28,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  progressTrack: { height: 3, background: "#16243a" },
  progressFill: { height: "100%", transition: "width 0.5s ease" },
  steps: { padding: "16px 18px 10px" },
  step: { display: "flex", gap: 13 },
  stepRail: { display: "flex", flexDirection: "column", alignItems: "center" },
  node: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1.5px solid #2a3d58",
    color: "#6B7C93",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    background: PAPER,
    transition: "all 0.3s",
  },
  nodeDone: { background: ACCENT, borderColor: ACCENT, color: INK },
  nodeActive: { borderColor: ACCENT, color: ACCENT, boxShadow: "0 0 0 4px rgba(0,224,184,0.12)" },
  nodeFailed: { borderColor: "#F5735E", color: "#F5735E" },
  connector: { width: 2, flex: 1, minHeight: 18, background: "#2a3d58", margin: "3px 0" },
  connectorDone: { background: ACCENT },
  stepBody: { paddingBottom: 16, flex: 1 },
  stepLabel: {
    fontSize: 13.5,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  stepLabelPending: { color: "#5A6B82", fontWeight: 500 },
  stepLabelFailed: { color: "#F5735E" },
  stepDetail: { fontSize: 12, color: "#93A3B8", marginTop: 4, lineHeight: 1.5 },
  stepResult: { marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 },
  resultBadge: {
    fontSize: 11.5,
    fontWeight: 700,
    color: ACCENT,
    background: "rgba(0,224,184,0.1)",
    border: "1px solid rgba(0,224,184,0.25)",
    padding: "3px 9px",
    borderRadius: 20,
  },
  resultBadgeFailed: {
    color: "#F5735E",
    background: "rgba(245,115,94,0.1)",
    border: "1px solid rgba(245,115,94,0.25)",
  },
  resultMeta: { fontSize: 11.5, color: "#7C8CA3", fontVariantNumeric: "tabular-nums" },
  resultLink: { fontSize: 11.5, color: "#7C8CA3", textDecoration: "none", fontVariantNumeric: "tabular-nums" },
  spinner: {
    width: 11,
    height: 11,
    borderRadius: "50%",
    border: "2px solid rgba(0,224,184,0.25)",
    borderTopColor: ACCENT,
    display: "inline-block",
    animation: "tftspin 0.7s linear infinite",
  },
  doneBanner: {
    margin: "4px 14px 16px",
    padding: "11px 13px",
    borderRadius: 10,
    background: "rgba(0,224,184,0.08)",
    border: "1px solid rgba(0,224,184,0.22)",
    fontSize: 12.5,
    color: "#9fe8d8",
    lineHeight: 1.45,
  },
};
