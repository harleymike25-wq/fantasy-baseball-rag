const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const { image, mimeType = "image/jpeg" } = body;
  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: "image field required (base64)" }) };
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: image },
          },
          {
            type: "text",
            text: `Identify this bottle of spirits. Return ONLY a JSON object:
{
  "brand": "exact brand name as printed on label",
  "canonical_name": "standardized name (translate non-English names; normalize to common form, e.g. 'Żubrówka' → 'Zubrowka Bison Grass Vodka')",
  "spirit_type": "primary category — one of: bourbon, rye, scotch, irish whiskey, japanese whisky, gin, vodka, rum, tequila, mezcal, brandy, cognac, armagnac, calvados, amaro, liqueur, vermouth, bitters, other",
  "subcategory": "specific style, e.g. wheated bourbon, london dry gin, blanco tequila, overproof rum",
  "origin": "country of origin",
  "proof": null or number,
  "notes": "age statement, cask finish, or any notable characteristic visible on label",
  "confidence": "high | medium | low"
}

If this is not a spirits bottle, return {"error": "not a spirits bottle"}.
Translate non-English brand names in canonical_name — keep the original in brand.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to parse bottle identification", raw: text }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  };
};
