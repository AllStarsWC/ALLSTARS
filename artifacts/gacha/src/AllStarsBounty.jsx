import { useState, useEffect } from "react";

// ── Exact pump.fun palette ──────────────────────────────
// bg:        #0f1012   (near-black)
// surface:   #16181d   (card bg)
// border:    #1f2128   (card border)
// border-hi: #2b2f3a   (hover border)
// text-pri:  #ffffff
// text-sec:  #6b7280
// text-muted:#374151
// green-hi:  #4ade80   (GO badge, rewards, open)
// green-dim: #166534   (GO badge bg)
// green-glow:#a8e063   (pencil/icon accent)
// ───────────────────────────────────────────────────────

const C = {
  bg:        "#0f1012",
  surface:   "#16181d",
  surfaceHi: "#1a1d23",
  border:    "#1f2128",
  borderHi:  "#2b2f3a",
  textPri:   "#ffffff",
  textSec:   "#6b7280",
  textMuted: "#374151",
  green:     "#4ade80",
  greenDim:  "#166534",
  greenSoft: "#a8e063",
  greenGlow: "#4ade8020",
  red:       "#f87171",
};

const TAG_META = {
  Creative: { color: "#a78bfa", bg: "#a78bfa15" },
  Design:   { color: "#38bdf8", bg: "#38bdf815" },
  IRL:      { color: "#fb923c", bg: "#fb923c15" },
  Dev:      { color: C.green,   bg: C.greenGlow },
  Writing:  { color: "#fbbf24", bg: "#fbbf2415" },
  Video:    { color: "#f472b6", bg: "#f472b615" },
};

// ── SVG Assets ───────────────────────────────────────────
const StarIcon = ({ size = 18, glow = false }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
    <polygon
      points="9,1.5 10.9,6.6 16.4,6.6 12,9.9 13.6,15 9,11.8 4.4,15 6,9.9 1.6,6.6 7.1,6.6"
      fill={glow ? C.greenSoft : C.green}
      style={glow ? { filter: `drop-shadow(0 0 4px ${C.greenSoft})` } : {}}
    />
  </svg>
);

// ── Countdown hook ───────────────────────────────────────
function useCountdown(endDate) {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endDate) - Date.now();
      if (diff <= 0) return setT("Expired");
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setT(`${d}d ${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [endDate]);
  return t;
}

// ── Data ─────────────────────────────────────────────────
const BOUNTIES = [];

// ── Bounty Card ──────────────────────────────────────────
function Card({ b }) {
  const time = useCountdown(b.end);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(b.likes);
  const [hover, setHover] = useState(false);
  const tag = TAG_META[b.tag] || TAG_META.Dev;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? C.surfaceHi : C.surface,
        border: `1px solid ${hover ? C.borderHi : C.border}`,
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: hover ? `0 4px 24px #00000040, inset 0 1px 0 #ffffff06` : `inset 0 1px 0 #ffffff04`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top shine line */}
      <div style={{
        position: "absolute", top: 0, left: "20px", right: "20px", height: "1px",
        background: hover
          ? `linear-gradient(90deg, transparent, ${C.green}30, transparent)`
          : `linear-gradient(90deg, transparent, #ffffff08, transparent)`,
        transition: "all 0.3s",
      }}/>

      {/* Row 1 — badges + coin */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <span style={{
            background: C.greenDim,
            color: C.green,
            borderRadius: "5px",
            fontSize: "10px",
            fontWeight: "700",
            padding: "2px 8px",
            letterSpacing: "0.8px",
            fontFamily: "monospace",
          }}>OPEN</span>
          <span style={{
            background: tag.bg,
            color: tag.color,
            borderRadius: "5px",
            fontSize: "10px",
            fontWeight: "600",
            padding: "2px 8px",
            letterSpacing: "0.5px",
            fontFamily: "monospace",
          }}>{b.tag}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", opacity: 0.5 }}>
          <StarIcon size={12} />
          <span style={{ color: C.textSec, fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.5px" }}>ALLSTARS</span>
        </div>
      </div>

      {/* Row 2 — title */}
      <div>
        <h3 style={{
          color: C.textPri,
          fontSize: "14px",
          fontWeight: "600",
          margin: "0 0 6px",
          lineHeight: "1.45",
          letterSpacing: "0.1px",
        }}>{b.title}</h3>
        <p style={{
          color: C.textSec,
          fontSize: "12px",
          margin: 0,
          lineHeight: "1.6",
        }}>{b.desc}</p>
      </div>

      {/* Row 3 — reward */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
        <span style={{
          color: C.green,
          fontSize: "24px",
          fontWeight: "700",
          fontFamily: "monospace",
          letterSpacing: "-0.5px",
          lineHeight: 1,
        }}>${b.reward.toLocaleString()}</span>
        <span style={{
          color: C.textMuted,
          fontSize: "12px",
          fontFamily: "monospace",
        }}>≡ {b.sol} SOL</span>
      </div>

      {/* Row 4 — progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        <div style={{
          height: "3px",
          background: "#1f2128",
          borderRadius: "99px",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${b.progress}%`,
            height: "100%",
            background: b.progress > 70 ? C.green : b.progress > 40 ? C.greenSoft : "#6b7280",
            borderRadius: "99px",
            boxShadow: b.progress > 70 ? `0 0 6px ${C.green}80` : "none",
            transition: "width 0.8s ease",
          }}/>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.textMuted, fontSize: "10px", fontFamily: "monospace" }}>{b.progress}% funded</span>
          <span style={{ color: C.textMuted, fontSize: "10px", fontFamily: "monospace" }}>{b.subs} submission{b.subs !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Row 5 — footer */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: `1px solid ${C.border}`,
        paddingTop: "12px",
        marginTop: "-2px",
      }}>
        <span style={{
          color: C.textSec,
          fontSize: "11px",
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}>
          <span style={{ color: time === "Expired" ? C.red : C.green, fontSize: "9px" }}>●</span>
          {time} left
        </span>
        <button
          onClick={e => {
            e.stopPropagation();
            setLiked(p => !p);
            setLikes(p => liked ? p - 1 : p + 1);
          }}
          style={{
            background: liked ? "#f8717115" : "none",
            border: `1px solid ${liked ? "#f8717140" : C.border}`,
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: liked ? C.red : C.textSec,
            fontSize: "12px",
            padding: "4px 10px",
            transition: "all 0.15s",
            fontFamily: "monospace",
          }}
          onMouseEnter={e => !liked && (e.currentTarget.style.borderColor = "#f8717140")}
          onMouseLeave={e => !liked && (e.currentTarget.style.borderColor = C.border)}
        >
          <span style={{ fontSize: "13px", lineHeight: 1 }}>{liked ? "♥" : "♡"}</span>
          <span>{likes}</span>
        </button>
      </div>
    </div>
  );
}

// ── Sidebar stat block ───────────────────────────────────
function StatBlock({ rank, title, value, sub, accent }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "10px",
      padding: "14px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
    }}>
      <span style={{
        background: accent + "18",
        color: accent,
        borderRadius: "6px",
        width: "24px", height: "24px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "11px", fontWeight: "700", fontFamily: "monospace",
        flexShrink: 0,
      }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: C.textPri, fontSize: "12px", fontWeight: "500",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</div>
        {sub && <div style={{ color: C.textSec, fontSize: "10px", fontFamily: "monospace", marginTop: "2px" }}>{sub}</div>}
      </div>
      <span style={{ color: C.green, fontSize: "13px", fontWeight: "700", fontFamily: "monospace", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────
export default function AllStarsBountyPage() {
  const total = BOUNTIES.reduce((s, b) => s + b.reward, 0);
  const totalSubs = BOUNTIES.reduce((s, b) => s + b.subs, 0);

  const sorted = [...BOUNTIES].sort((a, b) => b.reward - a.reward);

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.textPri,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "14px",
    }}>

      {/* ── NAV ── */}
      <nav style={{
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: "1280px", margin: "0 auto",
          padding: "0 24px", height: "56px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "30px", height: "30px",
              background: C.greenDim,
              borderRadius: "8px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <StarIcon size={16} glow />
            </div>
            <span style={{
              color: C.textPri,
              fontWeight: "600",
              fontSize: "15px",
              letterSpacing: "0.2px",
            }}>ALLSTARS</span>
            <span style={{
              background: C.greenDim,
              color: C.green,
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: "700",
              padding: "1px 7px",
              letterSpacing: "0.5px",
              fontFamily: "monospace",
            }}>BOUNTIES</span>
          </div>

          {/* Nav links */}
          <div style={{ display: "flex", gap: "2px" }}>
            {[{ label: "Home", href: "/" }, { label: "Bounties", href: "/bounties" }, { label: "Live", href: "/" }, { label: "Leaderboard", href: "/" }].map(l => (
              <a key={l.label} href={l.href} style={{
                background: "none", border: "none", cursor: "pointer",
                color: l.label === "Bounties" ? C.textPri : C.textSec,
                fontSize: "13px", padding: "6px 12px", borderRadius: "6px",
                fontWeight: l.label === "Bounties" ? "500" : "400",
                transition: "color 0.15s, background 0.15s",
                textDecoration: "none",
                display: "inline-block",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#ffffff08"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
              >{l.label}</a>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button style={{
              background: "none",
              border: `1px solid ${C.border}`,
              color: C.textSec,
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "12px",
              cursor: "pointer",
              transition: "border-color 0.15s, color 0.15s",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.color = C.textPri; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; }}
            >Sign in</button>
          </div>
        </div>
      </nav>

      {/* ── BODY ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px", display: "flex", gap: "24px" }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "700", letterSpacing: "-0.3px" }}>Bounties</h1>
                <span style={{
                  background: C.greenDim, color: C.green,
                  borderRadius: "5px", fontSize: "11px", fontWeight: "700",
                  padding: "1px 7px", fontFamily: "monospace",
                }}>{BOUNTIES.length} open</span>
              </div>
              <p style={{ margin: 0, color: C.textSec, fontSize: "13px" }}>
                Complete tasks, earn SOL rewards, grow the ALLSTARS community.
              </p>
            </div>
            <div style={{ display: "flex", gap: "20px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.green, fontSize: "18px", fontWeight: "700", fontFamily: "monospace" }}>${total.toLocaleString()}</div>
                <div style={{ color: C.textMuted, fontSize: "10px", letterSpacing: "0.5px", fontFamily: "monospace" }}>TOTAL REWARDS</div>
              </div>
              <div style={{ width: "1px", background: C.border }}/>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.textPri, fontSize: "18px", fontWeight: "700", fontFamily: "monospace" }}>{totalSubs}</div>
                <div style={{ color: C.textMuted, fontSize: "10px", letterSpacing: "0.5px", fontFamily: "monospace" }}>SUBMISSIONS</div>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "12px",
          }}>
            {BOUNTIES.map(b => <Card key={b.id} b={b} />)}
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div style={{ width: "280px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Top open bounties */}
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "12px",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: C.textSec, letterSpacing: "0.8px", fontFamily: "monospace" }}>
                TOP OPEN BOUNTIES
              </span>
              <span style={{ color: C.green, fontSize: "11px", cursor: "pointer", fontFamily: "monospace" }}>All →</span>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {sorted.slice(0, 3).map((b, i) => (
                <StatBlock
                  key={b.id}
                  rank={i + 1}
                  title={b.title}
                  sub={`${b.end.slice(5)} · ${b.subs} subs`}
                  value={`$${b.reward.toLocaleString()}`}
                  accent={i === 0 ? C.green : i === 1 ? C.greenSoft : C.textSec}
                />
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "12px",
            padding: "16px",
            display: "flex", flexDirection: "column", gap: "14px",
          }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: C.textSec, letterSpacing: "0.8px", fontFamily: "monospace" }}>
              COMMUNITY STATS
            </span>
            {[
              { label: "Total Rewards Pool", val: `$${total.toLocaleString()}` },
              { label: "Active Hunters", val: "—" },
              { label: "Completed Bounties", val: "0" },
              { label: "Avg. Reward", val: `$${Math.round(total / BOUNTIES.length).toLocaleString()}` },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.textSec, fontSize: "12px" }}>{s.label}</span>
                <span style={{ color: C.textPri, fontSize: "12px", fontWeight: "600", fontFamily: "monospace" }}>{s.val}</span>
              </div>
            ))}
          </div>

          {/* Powered by */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", opacity: 0.3,
          }}>
            <StarIcon size={11} />
            <span style={{ fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.5px", color: C.textSec }}>
              ALLSTARS · SOLANA
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
