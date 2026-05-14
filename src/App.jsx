import { useState } from "react";
import CabinetPage from "./pages/CabinetPage";
import SuggestPage from "./pages/SuggestPage";
import SetupPage from "./pages/SetupPage";
import { useCabinet } from "./hooks/useCabinet";
import "./App.css";

const TABS = [
  { id: "suggest", label: "Suggest" },
  { id: "cabinet", label: "My Bottles" },
  { id: "setup", label: "Setup" },
];

export default function App() {
  const [tab, setTab] = useState("suggest");
  const cabinet = useCabinet();

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span>🥃</span>
          <span>Cabinet</span>
        </div>
        <nav className="header__nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-tab ${tab === t.id ? "nav-tab--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="page">
        {tab === "suggest" && <SuggestPage cabinet={cabinet.bottles} />}
        {tab === "cabinet" && <CabinetPage cabinet={cabinet} />}
        {tab === "setup" && <SetupPage />}
      </div>
    </div>
  );
}
