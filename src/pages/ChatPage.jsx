import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatWindow from "../components/ChatWindow";
import PlayerSearch from "../components/PlayerSearch";
import {
  buildPlayerData,
  getSeasonStats,
  getTodayAndTomorrowSchedule,
} from "../lib/mlbClient";
import {
  buildStartSitRequest,
  buildTradeRequest,
  buildWaiverRequest,
  buildRosterCheckRequest,
} from "../lib/analyst";

const MODES = [
  { id: "start-sit", label: "Start / Sit" },
  { id: "trade",     label: "Trade"       },
  { id: "waiver",    label: "Waiver Wire" },
  { id: "roster-check", label: "Roster Check" },
  { id: "chat",      label: "Ask Anything" },
];

const POSITIONS = ["C","1B","2B","3B","SS","OF","SP","RP"];

const mdComponents = {
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  p:  ({ children }) => <p className="md-p">{children}</p>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  hr: () => <hr className="md-hr" />,
  table: ({ children }) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
};

function PlayerChip({ player, onRemove }) {
  return (
    <span className="player-chip">
      <span className="player-chip__name">{player.name}</span>
      <span className="player-chip__meta">{player.position} · {player.team}</span>
      <button className="player-chip__remove" onClick={() => onRemove(player)} aria-label="Remove">×</button>
    </span>
  );
}

export default function ChatPage({ rosterSummary, roster }) {
  const [mode, setMode] = useState("start-sit");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null); // "fetching" | "generating"
  const [error, setError] = useState(null);

  // Start/Sit
  const [ssPlayers, setSsPlayers] = useState([]);

  // Trade
  const [tradeGive, setTradeGive] = useState([]);
  const [tradeGet,  setTradeGet]  = useState([]);

  // Waiver
  const [waiverCandidates, setWaiverCandidates] = useState([]);
  const [waiverPosition,   setWaiverPosition]   = useState("");

  // Free chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const inputRef = useRef(null);

  function switchMode(m) {
    setMode(m);
    setResult(null);
    setError(null);
  }

  // ── Structured analyze ────────────────────────────────────────────────────
  async function runAnalysis(payload) {
    setLoading(true);
    setLoadingPhase("fetching");
    setResult(null);
    setError(null);

    try {
      // ── Phase 1: fetch MLB data in the browser (no Netlify timeout) ──
      let fetchedData = {};

      if (payload.mode === "start-sit") {
        const schedule = await getTodayAndTomorrowSchedule();
        const playerData = await Promise.all(
          payload.players.map((p) => buildPlayerData(p, schedule))
        );
        fetchedData = { playerData };
      } else if (payload.mode === "trade") {
        const [giveData, getData] = await Promise.all([
          Promise.all(
            payload.give.map(async (p) => ({
              player: p,
              seasonStats: await getSeasonStats(p.id, p.position).catch(() => ({})),
            }))
          ),
          Promise.all(
            payload.get.map(async (p) => ({
              player: p,
              seasonStats: await getSeasonStats(p.id, p.position).catch(() => ({})),
            }))
          ),
        ]);
        fetchedData = { giveData, getData };
      } else if (payload.mode === "waiver") {
        const schedule = await getTodayAndTomorrowSchedule();
        const playerData = await Promise.all(
          payload.candidates.map((p) => buildPlayerData(p, schedule))
        );
        fetchedData = { playerData };
      } else if (payload.mode === "roster-check") {
        const rosterEntries = Object.entries(roster ?? {})
          .filter(([, v]) => v?.player_name && v?.player_id)
          .map(([key, v]) => ({
            id: v.player_id,
            name: v.player_name,
            team: v.player_team,
            position: v.player_position,
            slot: key,
          }));
        const playerData = await Promise.all(
          rosterEntries.map(async (p) => ({
            slot: p.slot,
            player: { id: p.id, name: p.name, team: p.team, position: p.position },
            seasonStats: await getSeasonStats(p.id, p.position).catch(() => ({})),
          }))
        );
        fetchedData = { playerData };
      }

      // ── Phase 2: build Anthropic request in browser, send to minimal proxy ──
      setLoadingPhase("generating");

      let request;
      if (payload.mode === "start-sit") {
        request = buildStartSitRequest(fetchedData.playerData, rosterSummary);
      } else if (payload.mode === "trade") {
        request = buildTradeRequest(fetchedData.giveData, fetchedData.getData, rosterSummary);
      } else if (payload.mode === "waiver") {
        request = buildWaiverRequest(fetchedData.playerData, payload.position, rosterSummary);
      } else if (payload.mode === "roster-check") {
        request = buildRosterCheckRequest(fetchedData.playerData, rosterSummary);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let res;
      try {
        res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server error (${res.status}) — please try again.`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.reply);
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "Analysis timed out — please try again."
          : err.message
      );
      setResult(null);
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  }

  // ── Free chat ─────────────────────────────────────────────────────────────
  async function sendChat(text) {
    const userMsg = { role: "user", content: text };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, roster: rosterSummary }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? `Error: ${data.error ?? "Unknown"}` },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Network error: ${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
      inputRef.current?.focus();
    }
  }

  // ── Roster slot list for preview ──────────────────────────────────────────
  const rosterSlots = Object.entries(roster ?? {})
    .filter(([, v]) => v?.player_name)
    .map(([key, v]) => ({ key, name: v.player_name, team: v.player_team }));

  // ── Loading message per mode ──────────────────────────────────────────────
  const loadingMessages = {
    "start-sit":     "Fetching player data & matchups…",
    "trade":         "Pulling season stats…",
    "waiver":        "Analyzing candidates & schedules…",
    "roster-check":  "Auditing your full roster — this takes ~15 seconds…",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

      {/* Mode selector */}
      <div className="mode-tabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-tab ${mode === m.id ? "mode-tab--active" : ""}`}
            onClick={() => switchMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Free chat ── */}
      {mode === "chat" ? (
        <>
          <ChatWindow messages={chatMessages} loading={chatLoading} />
          <form
            className="input-bar"
            onSubmit={(e) => { e.preventDefault(); if (chatInput.trim() && !chatLoading) sendChat(chatInput.trim()); }}
          >
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about start/sit, waivers, trades…"
              disabled={chatLoading}
              className="chat-input"
            />
            <button type="submit" disabled={chatLoading || !chatInput.trim()} className="send-btn">
              {chatLoading ? "···" : "Send"}
            </button>
          </form>
        </>

      ) : loading ? (
        /* ── Loading spinner ── */
        <div className="analyze-loading">
          <div className="analyze-spinner" />
          <span>
            {loadingPhase === "fetching" ? "Fetching player data…" : "Generating analysis…"}
          </span>
        </div>

      ) : result ? (
        /* ── Result view ── */
        <div className="result-scroll">
          <button className="back-btn" onClick={() => setResult(null)}>← New Analysis</button>
          <div className="result-bubble">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {result}
            </ReactMarkdown>
          </div>
        </div>

      ) : (
        /* ── Forms ── */
        <div className="form-scroll">
          {error && <div className="form-error">{error}</div>}

          {/* ── Start / Sit ── */}
          {mode === "start-sit" && (
            <div>
              <p className="form-intro">Search and select two players to compare.</p>

              {["Player A", "Player B"].map((label, i) => (
                <div className="form-section" key={label}>
                  <label>{label}</label>
                  {ssPlayers[i] ? (
                    <PlayerChip player={ssPlayers[i]} onRemove={() => setSsPlayers((p) => p.filter((_, j) => j !== i))} />
                  ) : (
                    <PlayerSearch
                      placeholder={`Search ${label}…`}
                      onSelect={(p) => setSsPlayers((prev) => {
                        const next = [...prev];
                        next[i] = p;
                        return next;
                      })}
                    />
                  )}
                </div>
              ))}

              <button
                className="analyze-btn"
                disabled={ssPlayers.filter(Boolean).length < 2}
                onClick={() => runAnalysis({ mode: "start-sit", players: ssPlayers.slice(0, 2) })}
              >
                Analyze →
              </button>
            </div>
          )}

          {/* ── Trade ── */}
          {mode === "trade" && (
            <div>
              <p className="form-intro">Build both sides of the trade.</p>

              {[
                { label: "I Give", list: tradeGive, setList: setTradeGive },
                { label: "I Get",  list: tradeGet,  setList: setTradeGet  },
              ].map(({ label, list, setList }) => (
                <div className="form-section" key={label}>
                  <label>{label}</label>
                  <div className="player-chips">
                    {list.map((p) => (
                      <PlayerChip key={p.id} player={p} onRemove={(r) => setList((prev) => prev.filter((x) => x.id !== r.id))} />
                    ))}
                  </div>
                  {list.length < 3 && (
                    <div style={{ marginTop: 8 }}>
                      <PlayerSearch
                        placeholder="Add player…"
                        onSelect={(p) => setList((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p])}
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="trade-divider">trade</div>

              <button
                className="analyze-btn"
                disabled={!tradeGive.length || !tradeGet.length}
                onClick={() => runAnalysis({ mode: "trade", give: tradeGive, get: tradeGet })}
              >
                Analyze Trade →
              </button>
            </div>
          )}

          {/* ── Waiver Wire ── */}
          {mode === "waiver" && (
            <div>
              <p className="form-intro">Add players you're considering picking up.</p>

              <div className="form-section">
                <label>Position Needed (optional)</label>
                <select
                  className="position-select"
                  value={waiverPosition}
                  onChange={(e) => setWaiverPosition(e.target.value)}
                >
                  <option value="">Any position</option>
                  {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </div>

              <div className="form-section">
                <label>Candidates</label>
                <div className="player-chips">
                  {waiverCandidates.map((p) => (
                    <PlayerChip key={p.id} player={p} onRemove={(r) => setWaiverCandidates((prev) => prev.filter((x) => x.id !== r.id))} />
                  ))}
                </div>
                {waiverCandidates.length < 5 && (
                  <div style={{ marginTop: 8 }}>
                    <PlayerSearch
                      placeholder="Search player to add…"
                      onSelect={(p) => setWaiverCandidates((prev) => prev.find((x) => x.id === p.id) ? prev : [...prev, p])}
                    />
                  </div>
                )}
              </div>

              <button
                className="analyze-btn"
                disabled={!waiverCandidates.length}
                onClick={() => runAnalysis({ mode: "waiver", candidates: waiverCandidates, position: waiverPosition })}
              >
                Find Best Pickup →
              </button>
            </div>
          )}

          {/* ── Roster Check ── */}
          {mode === "roster-check" && (
            <div>
              <p className="form-intro">We'll pull season stats for every player on your roster and grade them.</p>

              {rosterSlots.length === 0 ? (
                <div className="form-empty">No roster found — go to My Team and build your roster first.</div>
              ) : (
                <>
                  <div className="form-section">
                    <label>{rosterSlots.length} players on your roster</label>
                    <div className="roster-preview">
                      {rosterSlots.map(({ key, name, team }) => (
                        <span key={key} className="roster-slot">
                          <span className="roster-slot__key">{key}</span>
                          <span className="roster-slot__name">{name} ({team})</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="form-note">⏱ This analysis fetches data for every player — expect ~15 seconds.</p>

                  <button
                    className="analyze-btn"
                    onClick={() => runAnalysis({ mode: "roster-check" })}
                  >
                    Check My Roster →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
