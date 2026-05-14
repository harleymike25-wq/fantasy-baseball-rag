import { useState } from "react";

export default function TeamSelector({ teams, activeTeamId, onSelect, onCreate, onRename, onDelete }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  function submitCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  }

  function submitRename(e) {
    e.preventDefault();
    if (!renameVal.trim()) return;
    onRename(renaming, renameVal.trim());
    setRenaming(null);
  }

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #1e293b", background: "#0f172a", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>TEAM</span>

      <select
        value={activeTeamId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 6,
          color: "#e2e8f0",
          fontSize: 13,
          padding: "4px 8px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {!activeTeamId && <option value="">— select a team —</option>}
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {activeTeam && renaming === activeTeamId ? (
        <form onSubmit={submitRename} style={{ display: "flex", gap: 4 }}>
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            style={inputStyle}
          />
          <Btn type="submit">Save</Btn>
          <Btn onClick={() => setRenaming(null)}>Cancel</Btn>
        </form>
      ) : (
        activeTeam && (
          <>
            <Btn onClick={() => { setRenaming(activeTeamId); setRenameVal(activeTeam.name); }}>Rename</Btn>
            <Btn
              onClick={() => {
                if (confirm(`Delete "${activeTeam.name}"?`)) onDelete(activeTeamId);
              }}
              danger
            >
              Delete
            </Btn>
          </>
        )
      )}

      {creating ? (
        <form onSubmit={submitCreate} style={{ display: "flex", gap: 4 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name..."
            style={inputStyle}
          />
          <Btn type="submit">Create</Btn>
          <Btn onClick={() => setCreating(false)}>Cancel</Btn>
        </form>
      ) : (
        <Btn onClick={() => setCreating(true)}>+ New Team</Btn>
      )}
    </div>
  );
}

const inputStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: 13,
  padding: "4px 8px",
  outline: "none",
};

function Btn({ children, onClick, type = "button", danger }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        background: danger ? "#7f1d1d" : "#1e293b",
        border: `1px solid ${danger ? "#991b1b" : "#334155"}`,
        borderRadius: 6,
        color: danger ? "#fca5a5" : "#94a3b8",
        fontSize: 12,
        padding: "4px 10px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
