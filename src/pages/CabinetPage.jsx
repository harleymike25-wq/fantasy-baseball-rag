import { useState } from "react";
import BottleCard from "../components/BottleCard";
import PhotoCapture from "../components/PhotoCapture";

const EMPTY_FORM = {
  brand: "",
  canonical_name: "",
  spirit_type: "",
  subcategory: "",
  origin: "",
};

const FIELDS = [
  ["brand", "Brand Name *"],
  ["canonical_name", "Canonical Name (auto-filled from photo)"],
  ["spirit_type", "Spirit Type * (e.g. gin, bourbon, rum)"],
  ["subcategory", "Subcategory (e.g. london dry gin, wheated bourbon)"],
  ["origin", "Country of Origin"],
];

export default function CabinetPage({ cabinet }) {
  const { bottles, loading, addBottle, removeBottle } = cabinet;
  const [adding, setAdding] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const grouped = bottles.reduce((acc, b) => {
    const key = b.spirit_type || "other";
    (acc[key] = acc[key] || []).push(b);
    return acc;
  }, {});

  async function handlePhoto(base64, mimeType) {
    setIdentifying(true);
    setError("");
    try {
      const res = await fetch("/api/identify-bottle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setIdentified(data);
        setForm({
          brand: data.brand || "",
          canonical_name: data.canonical_name || "",
          spirit_type: data.spirit_type || "",
          subcategory: data.subcategory || "",
          origin: data.origin || "",
        });
      }
    } catch {
      setError("Failed to identify bottle — fill in manually");
    } finally {
      setIdentifying(false);
    }
  }

  async function handleSave() {
    if (!form.brand || !form.spirit_type) return;
    setSaving(true);
    const payload = { ...form };
    if (!payload.canonical_name) payload.canonical_name = payload.brand;
    const { error: saveErr } = await addBottle(payload);
    setSaving(false);
    if (!saveErr) {
      setAdding(false);
      setIdentified(null);
      setForm(EMPTY_FORM);
      setError("");
    } else {
      setError(saveErr.message || "Failed to save");
    }
  }

  function cancelAdd() {
    setAdding(false);
    setIdentified(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">⌛</div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: "1.2rem", fontWeight: 600 }}>
          My Cabinet{" "}
          <span style={{ color: "var(--text-muted)", fontSize: "0.88rem", fontWeight: 400 }}>
            {bottles.length} bottle{bottles.length !== 1 ? "s" : ""}
          </span>
        </h1>
        {adding ? (
          <button className="btn btn--ghost" onClick={cancelAdd}>
            Cancel
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
            + Add Bottle
          </button>
        )}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 24 }}>
          {!identified && (
            <div style={{ marginBottom: 20 }}>
              <div className="section-title">Identify from Photo</div>
              {identifying ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "8px 0" }}>
                  Identifying bottle…
                </div>
              ) : (
                <PhotoCapture onCapture={handlePhoto} />
              )}
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.78rem",
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border)",
                }}
              >
                — or fill in manually below —
              </div>
            </div>
          )}

          {identified && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 14px",
                background: "var(--amber-dim)",
                borderRadius: "var(--radius)",
                fontSize: "0.85rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                Identified: <strong>{identified.canonical_name}</strong>
                {identified.confidence === "low" && (
                  <span style={{ color: "var(--amber)", marginLeft: 6 }}>
                    (low confidence — verify below)
                  </span>
                )}
              </span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
                onClick={() => setIdentified(null)}
              >
                Re-photo
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                color: "#c05050",
                fontSize: "0.85rem",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <input
                  className="input"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={key === "spirit_type" ? "e.g. gin, bourbon, rum, mezcal" : ""}
                />
              </div>
            ))}
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={!form.brand || !form.spirit_type || saving}
              style={{ marginTop: 4 }}
            >
              {saving ? "Saving…" : "Save to Cabinet"}
            </button>
          </div>
        </div>
      )}

      {bottles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🍾</div>
          <div className="empty-state__title">Cabinet is empty</div>
          <div className="empty-state__sub">Add your first bottle above</div>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([type, items]) => (
            <div key={type} style={{ marginBottom: 28 }}>
              <div className="section-title">{type}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((b) => (
                  <BottleCard key={b.id} bottle={b} onRemove={() => removeBottle(b.id)} />
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
