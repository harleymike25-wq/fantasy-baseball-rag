import { useState } from "react";
import SuggestionCard from "../components/SuggestionCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function SuggestPage({ cabinet }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function getSuggestions() {
    if (cabinet.length === 0) {
      setError('Add some bottles first in "My Bottles"');
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cabinet,
          query: query.trim() || "What cocktails can I make?",
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else if (data.message) setError(data.message);
      else setResult(data);
    } catch {
      setError("Request failed — check your network");
    } finally {
      setLoading(false);
    }
  }

  const hasSuggestions =
    result && (result.can_make?.length > 0 || result.almost_there?.length > 0);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 4 }}>
          What can I make?
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          {cabinet.length} bottle{cabinet.length !== 1 ? "s" : ""} in your cabinet
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && getSuggestions()}
          placeholder="e.g. something spirit-forward, a citrusy sour, a classic…"
        />
        <button
          className="btn btn--primary"
          onClick={getSuggestions}
          disabled={loading}
          style={{ flexShrink: 0 }}
        >
          {loading ? "Thinking…" : "Suggest"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#c05050", marginBottom: 16, fontSize: "0.88rem" }}>{error}</div>
      )}

      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🥃</div>
          <div>Analysing your cabinet…</div>
        </div>
      )}

      {result && !hasSuggestions && (
        <div className="empty-state">
          <div className="empty-state__icon">🤔</div>
          <div className="empty-state__title">No matches found</div>
          <div className="empty-state__sub">
            Try ingesting a recipe book first (Setup tab)
          </div>
        </div>
      )}

      {hasSuggestions && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {result.can_make?.length > 0 && (
            <div>
              <div className="section-title">Can Make Now</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.can_make.map((s, i) => (
                  <SuggestionCard key={i} suggestion={s} type="can_make" />
                ))}
              </div>
            </div>
          )}

          {result.almost_there?.length > 0 && (
            <div>
              <div className="section-title">Almost There</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.almost_there.map((s, i) => (
                  <SuggestionCard key={i} suggestion={s} type="almost" />
                ))}
              </div>
            </div>
          )}

          {result.bartender_note && (
            <div className="card" style={{ borderColor: "rgba(200,146,42,0.25)" }}>
              <div className="section-title" style={{ marginBottom: 10 }}>
                Bartender's Note
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.7,
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.bartender_note}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && cabinet.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🍾</div>
          <div className="empty-state__title">Your cabinet is empty</div>
          <div className="empty-state__sub">Go to "My Bottles" to add your spirits</div>
        </div>
      )}
    </div>
  );
}
