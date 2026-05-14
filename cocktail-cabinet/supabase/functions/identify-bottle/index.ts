import Anthropic from "npm:@anthropic-ai/sdk";
import { handleCors, json } from "../_shared/cors.ts";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { image, mimeType = "image/jpeg" } = body;
  if (!image) return json({ error: "image field required (base64)" }, 400);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/jpeg", data: image },
          },
          {
            type: "text",
            text: `Identify this bottle of spirits. Return ONLY a JSON object:
{
  "brand": "exact brand name as printed on label",
  "canonical_name": "standardized name (translate non-English names to standard English form)",
  "spirit_type": "one of: bourbon, rye, scotch, irish whiskey, japanese whisky, gin, vodka, rum, tequila, mezcal, brandy, cognac, armagnac, calvados, amaro, liqueur, vermouth, bitters, other",
  "subcategory": "specific style, e.g. wheated bourbon, london dry gin, blanco tequila, jamaican rum",
  "origin": "country of origin",
  "proof": null or number,
  "notes": "age statement, cask finish, or any notable characteristic visible on label",
  "confidence": "high | medium | low"
}

If not a spirits bottle, return {"error": "not a spirits bottle"}.
Translate non-English names in canonical_name — keep original spelling in brand.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return json(JSON.parse(match ? match[0] : text));
  } catch {
    return json({ error: "Failed to parse bottle identification", raw: text }, 500);
  }
});
