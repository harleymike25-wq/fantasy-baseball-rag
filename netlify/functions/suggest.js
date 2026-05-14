const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return createClient(url, key);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { cabinet = [], query = "What cocktails can I make?" } = body;

  if (cabinet.length === 0) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Add some bottles to your cabinet first." }),
    };
  }

  const supabase = getSupabase();

  // Fetch all recipes — Claude will do the smart matching
  const { data: recipes, error } = await supabase
    .from("recipes")
    .select("name, ingredients, instructions, glassware, garnish, spirit_categories, notes")
    .limit(100);

  if (error) {
    console.error("Supabase error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch recipes" }) };
  }

  if (!recipes || recipes.length === 0) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "No recipes found. Run the ingest script first (Setup tab)." }),
    };
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

  const recipeList = recipes
    .map((r) => {
      const ingredients = Array.isArray(r.ingredients)
        ? r.ingredients
            .map(
              (i) =>
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

  const systemPrompt = `You are an expert bartender and spirits advisor. You know spirits deeply — flavor profiles, regional variations, and how they substitute for one another. Analyze a person's liquor cabinet and recommend cocktails from a provided recipe list.

Be specific. Explain WHY each recommendation works with their exact bottles. Note genuine substitutions with brief flavor context.

Substitution guide (apply intelligently):
- Bourbon ↔ rye: good sub, rye is spicier/drier
- Cognac ↔ Armagnac: excellent, Armagnac is more rustic
- Any Cognac/Armagnac ↔ quality brandy: acceptable
- Mezcal ↔ blanco tequila: acceptable, mezcal adds smoke
- Sweet vermouth ↔ Punt e Mes / Carpano Antica: excellent
- Dry vermouth ↔ fino sherry: acceptable
- Triple sec ↔ Cointreau: exact; ↔ Grand Marnier: adds cognac depth
- London dry gin ↔ most gins: mostly exact
- Aged/dark rum ↔ rhum agricole: different character but workable
- Lemon juice ↔ lime juice: acceptable in most recipes`;

  const userMessage = `My liquor cabinet:
${cabinetSummary}

User's question: "${query}"

Available recipes:

${recipeList}

Respond with ONLY a JSON object in this exact structure:
{
  "can_make": [
    {
      "name": "Cocktail Name",
      "match_quality": "exact | good | acceptable",
      "explanation": "Why this works with their specific bottles",
      "substitutions": ["any sub being made, with brief note"],
      "recipe_highlight": "one key tip or technique"
    }
  ],
  "almost_there": [
    {
      "name": "Cocktail Name",
      "missing": ["ingredient they don't have"],
      "have": ["ingredients they already have for this"],
      "explanation": "Why it's worth getting the missing ingredient"
    }
  ],
  "bartender_note": "A paragraph of broader advice — what style their collection leans toward, what single bottle would unlock the most new cocktails, any interesting combos they might not have considered."
}

List 3–6 in can_make, 2–4 in almost_there. Quality over quantity. Only include recipes from the provided list.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content[0].text.trim();
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: text }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error("Claude error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to generate suggestions" }) };
  }
};
