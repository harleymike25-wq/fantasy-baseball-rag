import SlotRow from "./SlotRow";

const HITTER_SLOTS = [
  { label: "C",    key: "C" },
  { label: "1B",   key: "1B" },
  { label: "2B",   key: "2B" },
  { label: "3B",   key: "3B" },
  { label: "SS",   key: "SS" },
  { label: "OF",   key: "OF_1" },
  { label: "OF",   key: "OF_2" },
  { label: "OF",   key: "OF_3" },
  { label: "UTIL", key: "UTIL_1" },
  { label: "UTIL", key: "UTIL_2" },
  { label: "BN",   key: "BN_H_1" },
  { label: "BN",   key: "BN_H_2" },
  { label: "BN",   key: "BN_H_3" },
  { label: "BN",   key: "BN_H_4" },
  { label: "BN",   key: "BN_H_5" },
];

const PITCHER_SLOTS = [
  { label: "SP", key: "SP_1" },
  { label: "SP", key: "SP_2" },
  { label: "SP", key: "SP_3" },
  { label: "RP", key: "RP_1" },
  { label: "RP", key: "RP_2" },
  { label: "P",  key: "P_1" },
  { label: "P",  key: "P_2" },
  { label: "P",  key: "P_3" },
  { label: "BN", key: "BN_P_1" },
  { label: "BN", key: "BN_P_2" },
  { label: "BN", key: "BN_P_3" },
  { label: "BN", key: "BN_P_4" },
  { label: "BN", key: "BN_P_5" },
];

function Column({ title, slots, roster, onSelect, onClear }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          padding: "6px 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: 1,
          borderBottom: "1px solid #334155",
        }}
      >
        {title}
      </div>
      {slots.map(({ label, key }) => (
        <SlotRow
          key={key}
          label={label}
          slotKey={key}
          player={roster[key]}
          onSelect={onSelect}
          onClear={onClear}
        />
      ))}
    </div>
  );
}

export default function RosterGrid({ roster, onSelect, onClear }) {
  return (
    <div style={{ display: "flex", gap: 1, flex: 1, overflow: "auto", background: "#0f172a" }}>
      <Column
        title="Hitters"
        slots={HITTER_SLOTS}
        roster={roster}
        onSelect={onSelect}
        onClear={onClear}
      />
      <div style={{ width: 1, background: "#1e293b" }} />
      <Column
        title="Pitchers"
        slots={PITCHER_SLOTS}
        roster={roster}
        onSelect={onSelect}
        onClear={onClear}
      />
    </div>
  );
}
