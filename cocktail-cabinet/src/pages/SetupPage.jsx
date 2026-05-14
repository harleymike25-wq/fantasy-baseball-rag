import { useState, useRef } from "react";
import { ingestPDF } from "../lib/api";

const SCHEMA_SQL = `create table if not exists cabinet (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  brand text not null,
  canonical_name text not null,
  spirit_type text not null,
  subcategory text,
  origin text,
  notes text,
  photo_url text
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  ingredients jsonb not null,
  instructions text not null,
  glassware text,
  garnish text,
  spirit_categories text[],
  tags text[],
  notes text,
  source text default 'speakeater'
);

create index if not exists recipes_spirit_idx
  on recipes using gin(spirit_categories);`;

export default function SetupPage() {
  const fileRef = useRef();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handlePDF(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(",")[1];
      try {
        setStatus(await ingestPDF(base64));
      } catch {
        setStatus({ error: "Upload failed — try the CLI script for large PDFs" });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function copySQL() {
    navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 6 }}>Setup</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: 28 }}>One-time setup to get the app running.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Step 1 — Supabase Schema</div>
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Run this SQL in your Supabase project's SQL editor.
        </p>
        <div style={{ position: "relative" }}>
          <pre style={{ background: "var(--bg)", borderRadius: "var(--radius)", padding: "14px 16px", fontSize: "0.75rem", color: "var(--amber-light)", overflowX: "auto", lineHeight: 1.7, border: "1px solid var(--border)", fontFamily: "ui-monospace, Menlo, monospace" }}>
            {SCHEMA_SQL}
          </pre>
          <button className="btn btn--ghost" onClick={copySQL} style={{ position: "absolute", top: 10, right: 10, padding: "4px 10px", fontSize: "0.75rem" }}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Step 2 — Ingest Cocktail Book</div>
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
          Upload your cocktail book PDF. Claude will extract all recipes and store them.
        </p>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16, padding: "8px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius)", lineHeight: 1.6 }}>
          For large PDFs (&gt;30 pages), use the CLI to avoid timeouts:<br />
          <code style={{ color: "var(--amber)", fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
            npm run ingest /path/to/cocktails.pdf
          </code>
        </p>

        {loading
          ? <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>📖 Extracting recipes — this may take a minute…</div>
          : <button className="btn btn--primary" onClick={() => fileRef.current.click()}>Upload PDF</button>
        }

        <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDF} style={{ display: "none" }} />

        {status && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: status.error ? "rgba(124,74,74,0.15)" : "var(--amber-dim)", borderRadius: "var(--radius)", fontSize: "0.88rem" }}>
            {status.error ? `Error: ${status.error}` : `✓ Ingested ${status.count} recipes`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Step 3 — Deploy Edge Functions</div>
        <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
          Deploy the Supabase Edge Functions and set your secrets:
        </p>
        <pre style={{ background: "var(--bg)", borderRadius: "var(--radius)", padding: "12px 14px", fontSize: "0.75rem", color: "var(--amber-light)", lineHeight: 1.8, border: "1px solid var(--border)", fontFamily: "ui-monospace, Menlo, monospace" }}>
{`# Install Supabase CLI if needed
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Set the Anthropic API key as a secret
supabase secrets set ANTHROPIC_API_KEY=your-key

# Deploy all three functions
supabase functions deploy identify-bottle
supabase functions deploy suggest
supabase functions deploy ingest`}
        </pre>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
          Frontend env vars (Netlify site settings + local <code style={{ color: "var(--amber)", fontFamily: "ui-monospace, monospace" }}>.env</code>):
        </p>
        <pre style={{ background: "var(--bg)", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: "0.75rem", color: "var(--amber-light)", lineHeight: 1.8, border: "1px solid var(--border)", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 8 }}>
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
      </div>
    </div>
  );
}
