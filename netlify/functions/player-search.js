const MLB_BASE = "https://statsapi.mlb.com/api/v1";

exports.handler = async (event) => {
  const query = event.queryStringParameters?.q?.trim();
  if (!query || query.length < 2) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  try {
    const res = await fetch(
      `${MLB_BASE}/people/search?names=${encodeURIComponent(query)}&sportId=1&limit=8&hydrate=currentTeam`
    );
    const data = await res.json();

    const players = (data.people ?? []).slice(0, 8).map((p) => ({
      id: p.id,
      name: p.fullName,
      team: p.currentTeam?.name ?? "Free Agent",
      position: p.primaryPosition?.abbreviation ?? "?",
      bats: p.batSide?.code,
      throws: p.pitchHand?.code,
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(players),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
