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
        <div className="header__brand">
          <span>⚾</span>
          <span>Fantasy Baseball AI</span>
        </div>

        <div className="header__team-row">
          {teams.length > 0 ? (
            <select
              value={activeTeamId ?? ""}
              onChange={(e) => setActiveTeamId(e.target.value || null)}
              className="header__team-select"
            >
              {!activeTeamId && <option value="">— select team —</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="header__no-team">No teams yet</span>
          )}
        </div>

        <nav className="header__nav">
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
        <ChatPage rosterSummary={teamHook.getRosterSummary()} roster={teamHook.roster} />
      )}
    </div>
  );
}

export default App;
