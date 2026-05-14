import PlayerSearch from "./PlayerSearch";

const SLOT_COLORS = {
  C: "#6366f1", "1B": "#f59e0b", "2B": "#f59e0b", "3B": "#f59e0b",
  SS: "#f59e0b", OF: "#22c55e", UTIL: "#94a3b8",
  SP: "#3b82f6", RP: "#06b6d4", P: "#8b5cf6", BN: "#475569",
};

export default function SlotRow({ label, slotKey, player, onSelect, onClear }) {
  const color = SLOT_COLORS[label] ?? "#64748b";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        borderBottom: "1px solid #1e293b",
        minHeight: 36,
      }}
    >
      <span
        style={{
          minWidth: 36,
          fontSize: 11,
          fontWeight: 700,
          color,
          textAlign: "center",
          background: color + "22",
          borderRadius: 4,
          padding: "2px 4px",
        }}
      >
        {label}
      </span>

      {player?.player_name ? (
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 13, color: "#e2e8f0" }}>{player.player_name}</span>
            <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
              {player.player_position} · {player.player_team}
            </span>
          </div>
          <button
            onClick={() => onClear(slotKey)}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
            title="Remove player"
          >
            ×
          </button>
        </div>
      ) : (
        <PlayerSearch
          placeholder={`Add ${label}...`}
          onSelect={(p) => onSelect(slotKey, p)}
        />
      )}
    </div>
  );
}
