import { useState } from "react";

export default function RosterPanel({ onSendRoster }) {
  const [roster, setRoster] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!roster.trim()) return;
    onSendRoster(roster.trim());
    setSubmitted(true);
  }

  return (
    <div
      style={{
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
        padding: "10px 16px",
        fontSize: 13,
      }}
    >
      {submitted ? (
        <div style={{ color: "#22c55e", display: "flex", alignItems: "center", gap: 8 }}>
          ✓ Roster loaded —{" "}
          <button
            onClick={() => setSubmitted(false)}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            update
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            value={roster}
            onChange={(e) => setRoster(e.target.value)}
            placeholder="Enter your roster (e.g. Gunnar Henderson, Freddie Freeman, Spencer Strider...)"
            style={{
              flex: 1,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "6px 12px",
              color: "#e2e8f0",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Load Roster
          </button>
        </form>
      )}
    </div>
  );
}
