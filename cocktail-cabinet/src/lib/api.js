const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function fnUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

export async function identifyBottle(image, mimeType) {
  const res = await fetch(fnUrl("identify-bottle"), {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ image, mimeType }),
  });
  return res.json();
}

export async function getSuggestions(cabinet, query) {
  const res = await fetch(fnUrl("suggest"), {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ cabinet, query }),
  });
  return res.json();
}

export async function ingestPDF(base64) {
  const res = await fetch(fnUrl("ingest"), {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ pdf: base64 }),
  });
  return res.json();
}
