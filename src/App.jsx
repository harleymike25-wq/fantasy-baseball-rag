import { useState } from "react";
import { useTeam } from "./hooks/useTeam";
import RosterPage from "./pages/RosterPage";
import ChatPage from "./pages/ChatPage";
import "./App.css";

function App() {
  const [tab, setTab] = useState("chat");
  const teamHook = useTeam();
  const { teams, activeTeamId, setActiveTeamId } = teamHook;
  const activeTeam = teams.find((t) => t.id === activeTeamId);

  return (
    <div className="app">
      <header className="header">
        <span>⚾</span>
        <span>Fantasy Baseball AI</span>

        {/* Team dropdown visible on both tabs */}
        <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 6 }}>
          {teams.length > 0 ? (
            <select
              value={activeTeamId ?? ""}
              onChange={(e) => setActiveTeamId(e.target.value || null)}
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 6,
                color: activeTeam ? "#e2e8f0" : "#64748b",
                fontSize: 13,
                padding: "4px 8px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {!activeTeamId && <option value="">— select team —</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: "#475569" }}>No teams yet</span>
          )}
        </div>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["chat", "roster"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`nav-tab ${tab === t ? "nav-tab--active" : "nav-tab--inactive"}`}
            >
              {t === "roster" ? "My Team" : "Chat"}
            </button>
          ))}
        </nav>
      </header>

      {tab === "roster" ? (
        <RosterPage teamHook={teamHook} />
      ) : (
        <ChatPage rosterSummary={teamHook.getRosterSummary()} />
      )}
    </div>
  );
}

export default App;
