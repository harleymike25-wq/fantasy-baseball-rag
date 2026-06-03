import { useState, useEffect, useRef } from "react";

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function PlayerSearch({ onSelect, placeholder = "Search player..." }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const containerRef = useRef(null);

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); setOpen(false); return; }
    setFetching(true);
    fetch(`/api/player-search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setFetching(false));
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(player) {
    onSelect(player);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 6,
          padding: "4px 8px",
          color: "#e2e8f0",
          fontSize: 16,
          outline: "none",
        }}
        onFocus={() => results.length && setOpen(true)}
      />
      {fetching && (
        <span style={{ position: "absolute", right: 8, top: 5, fontSize: 11, color: "#64748b" }}>
          ...
        </span>
      )}
      {open && results.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            marginTop: 2,
            padding: 0,
            listStyle: "none",
            zIndex: 100,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {results.map((p) => (
            <li
              key={p.id}
              onMouseDown={() => handleSelect(p)}
              style={{
                padding: "7px 10px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                borderBottom: "1px solid #0f172a",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "#e2e8f0" }}>{p.name}</span>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {p.position} · {p.team}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
