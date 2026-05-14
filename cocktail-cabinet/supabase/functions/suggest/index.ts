import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { handleCors, json } from "../_shared/cors.ts";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// These are always assumed to be in the cabinet — never count as missing
const ASSUMED_BITTERS = [
  "angostura bitters",
  "peychaud's bitters",
  "bitters",
  "aromatic bitters",
];

interface Bottle {
  brand: string;
  canonical_name?: string;
  spirit_type: string;
  subcategory?: string;
  origin?: string;
}

interface Ingredient {
  amount?: string;
  unit?: string;
  ingredient: string;
  optional?: boolean;
}

interface Recipe {
  name: string;
  ingredients: Ingredient[];
  instructions: string;
  glassware?: string;
  garnish?: string;
  spirit_categories?: string[];
  notes?: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let body: { cabinet?: Bottle[]; query?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { cabinet = [], query = "What cocktails can I make?" } = body;

  if (cabinet.length === 0) {
    return json({ message: "Add some bottles to your cabinet first." });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Build the full list of spirit types available (cabinet + assumed bitters)
  const cabinetSpirits = [
    ...new Set([
      ...cabinet.flatMap((b) =>
        [b.spirit_type, b.subcategory, b.canonical_name]
          .filter(Boolean)
          .map((s) => s!.toLowerCase())
      ),
      ...ASSUMED_BITTERS,
    ]),
  ];

  // Smart pre-filter: only fetch recipes that overlap with available spirits
  let { data: recipes } = await supabase
    .from("recipes")
    .select("name, ingredients, instructions, glassware, garnish, spirit_categories, notes")
    .overlaps("spirit_categories", cabinetSpirits)
    .limit(30);

  // Fallback: if too few matches, broaden the fetch
  if (!recipes || recipes.length < 5) {
    const fallback = await supabase
      .from("recipes")
      .select("name, ingredients, instructions, glassware, garnish, spirit_categories, notes")
      .limit(40);
    recipes = fallback.data;
  }

  if (!recipes || recipes.length === 0) {
    return json({ message: "No recipes found. Upload your cocktail book PDF in the Setup tab." });
  }

  const cabinetSummary = cabinet
    .map((b) => {
      const parts = [b.brand];
      if (b.canonical_name && b.canonical_name !== b.brand) parts.push(`(${b.canonical_name})`);
      parts.push(`— ${b.spirit_type}`);
      if (b.subcategory) parts.push(`/ ${b.subcategory}`);
      if (b.origin) parts.push(`· ${b.origin}`);
      return `• ${parts.join(" ")}`;
    })
    .join("\n");

  const recipeList = (recipes as Recipe[])
    .map((r) => {
      const ingredients = Array.isArray(r.ingredients)
        ? r.ingredients
            .map((i) =>
              `  · ${[i.amount, i.unit, i.ingredient].filter(Boolean).join(" ")}${i.optional ? " (optional)" : ""}`
            )
            .join("\n")
        : JSON.stringify(r.ingredients);
      const method = r.instructions
        ? r.instructions.slice(0, 200) + (r.instructions.length > 200 ? "…" : "")
        : "";
      return `### ${r.name}\nIngredients:\n${ingredients}\nMethod: ${method}\nGlass: ${r.glassware || "—"} | Garnish: ${r.garnish || "none"}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are an expert bartender and spirits advisor. Analyze a person's liquor cabinet and recommend cocktails from a provided recipe list. Be specific — explain WHY each recommendation works with their exact bottles.

PANTRY STAPLES — always assume available, never count as missing:
- Angostura bitters
- Peychaud's bitters
If a recipe calls for "bitters" or "aromatic bitters" unspecified, assume Angostura is available.

Substitution guide:
- Bourbon ↔ rye: good sub, rye is spicier/drier
- Cognac ↔ Armagnac: excellent, Armagnac is more rustic
- Any Cognac/Armagnac ↔ quality brandy: acceptable
- Mezcal ↔ blanco tequila: acceptable, mezcal adds smoke
- Sweet vermouth ↔ Punt e Mes / Carpano Antica: excellent
- Dry vermouth ↔ fino sherry: acceptable
- Triple sec ↔ Cointreau: exact; ↔ Grand Marnier: adds cognac depth
- London dry gin ↔ most gins: mostly exact`;

  const userMessage = `My liquor cabinet:\n${cabinetSummary}\n\nUser's question: "${query}"\n\nAvailable recipes (pre-filtered to match your spirits):\n\n${recipeList}\n\nRespond with ONLY a JSON object:\n{\n  "can_make": [\n    {\n      "name": "Cocktail Name",\n      "match_quality": "exact | good | acceptable",\n      "explanation": "Why this works with their specific bottles",\n      "substitutions": ["any sub being made, with brief note"],\n      "recipe_highlight": "one key tip or technique"\n    }\n  ],\n  "almost_there": [\n    {\n      "name": "Cocktail Name",\n      "missing": ["ingredient they don't have"],\n      "have": ["ingredients they already have for this"],\n      "explanation": "Why it's worth getting the missing ingredient"\n    }\n  ],\n  "bartender_note": "Broader advice — what style their collection leans toward, what one bottle would unlock the most new cocktails, any interesting combos they might not have considered."\n}\n\nList 3–6 in can_make, 2–4 in almost_there. Quality over quantity. Only use recipes from the provided list.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return json(JSON.parse(match ? match[0] : text));
    } catch {
      return json({ raw: text });
    }
  } catch (err) {
    console.error("Claude error:", err);
    return json({ error: "Failed to generate suggestions" }, 500);
  }
});
