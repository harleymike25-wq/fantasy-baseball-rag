import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { handleCors, json } from "../_shared/cors.ts";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let body: { pdf?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { pdf } = body;
  if (!pdf) return json({ error: "pdf field required (base64)" }, 400);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdf },
          },
          {
            type: "text",
            text: `Extract ALL cocktail recipes from this document. Return ONLY a JSON array:\n\n[\n  {\n    "name": "Cocktail Name",\n    "ingredients": [\n      { "amount": "1.5", "unit": "oz", "ingredient": "gin", "category": "gin", "optional": false }\n    ],\n    "instructions": "Full method text",\n    "glassware": "coupe",\n    "garnish": "lemon twist",\n    "spirit_categories": ["gin", "sweet vermouth", "campari"],\n    "tags": ["classic", "stirred"],\n    "notes": "history or tips"\n  }\n]\n\nRules:\n- spirit_categories: all spirits, liqueurs, and key modifiers — lowercase, no amounts\n- For bitters: use "angostura bitters", "peychaud's bitters", "orange bitters", etc. — be specific\n- Include every recipe\n- Return ONLY the JSON array`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  let recipes: unknown[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    recipes = JSON.parse(match ? match[0] : text);
  } catch {
    return json({ error: "Failed to parse recipes from PDF", raw: text.slice(0, 500) }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let inserted = 0;
  for (let i = 0; i < recipes.length; i += 20) {
    const { error } = await supabase.from("recipes").insert(recipes.slice(i, i + 20));
    if (!error) inserted += Math.min(20, recipes.length - i);
  }

  return json({ count: inserted, total: recipes.length, source: "pdf" });
});
