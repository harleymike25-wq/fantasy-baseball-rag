export default function BottleCard({ bottle, onRemove }) {
  return (
    <div
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: "0.95rem" }}>{bottle.brand}</div>
        {bottle.canonical_name && bottle.canonical_name !== bottle.brand && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 1 }}>
            {bottle.canonical_name}
          </div>
        )}
        <div style={{ fontSize: "0.8rem", marginTop: 3 }}>
          <span style={{ color: "var(--amber)" }}>
            {bottle.subcategory || bottle.spirit_type}
          </span>
          {bottle.origin && (
            <span style={{ color: "var(--text-muted)" }}> · {bottle.origin}</span>
          )}
        </div>
      </div>
      <button className="btn btn--danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}
