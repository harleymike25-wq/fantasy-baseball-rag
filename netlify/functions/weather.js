const BALLPARKS = {
  "Yankee Stadium": { lat: 40.8296, lon: -73.9262 },
  "Fenway Park": { lat: 42.3467, lon: -71.0972 },
  "Wrigley Field": { lat: 41.9484, lon: -87.6553 },
  "Dodger Stadium": { lat: 34.0739, lon: -118.24 },
  "Oracle Park": { lat: 37.7786, lon: -122.3893 },
  "Truist Park": { lat: 33.8908, lon: -84.4678 },
  "Great American Ball Park": { lat: 39.0979, lon: -84.5082 },
  "PNC Park": { lat: 40.4469, lon: -80.0057 },
  "Busch Stadium": { lat: 38.6226, lon: -90.1928 },
  "American Family Field": { lat: 43.0283, lon: -87.9712 },
  "Citi Field": { lat: 40.7571, lon: -73.8458 },
  "Citizens Bank Park": { lat: 39.9061, lon: -75.1665 },
  "Nationals Park": { lat: 38.8730, lon: -77.0074 },
  "Marlins Park": { lat: 25.7781, lon: -80.2197 },
  "LoanDepot Park": { lat: 25.7781, lon: -80.2197 },
  "Minute Maid Park": { lat: 29.7573, lon: -95.3555 },
  "Globe Life Field": { lat: 32.7473, lon: -97.0822 },
  "Kauffman Stadium": { lat: 39.0517, lon: -94.4803 },
  "Target Field": { lat: 44.9817, lon: -93.2781 },
  "Guaranteed Rate Field": { lat: 41.8300, lon: -87.6338 },
  "Angel Stadium": { lat: 33.8003, lon: -117.8827 },
  "Oakland Coliseum": { lat: 37.7516, lon: -122.2005 },
  "T-Mobile Park": { lat: 47.5914, lon: -122.3325 },
  "Petco Park": { lat: 32.7076, lon: -117.1570 },
  "Chase Field": { lat: 33.4453, lon: -112.0667 },
  "Coors Field": { lat: 39.7559, lon: -104.9942 },
  "Progressive Field": { lat: 41.4962, lon: -81.6852 },
  "Comerica Park": { lat: 42.3390, lon: -83.0485 },
  "Rogers Centre": { lat: 43.6414, lon: -79.3894 },
  "Camden Yards": { lat: 39.2838, lon: -76.6218 },
};

function findBallpark(venueName) {
  if (!venueName) return null;
  const key = Object.keys(BALLPARKS).find((k) =>
    venueName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(venueName.toLowerCase())
  );
  return key ? BALLPARKS[key] : null;
}

function describeWind(speed, deg, venueName) {
  const isCoorsOrWrigley =
    venueName?.toLowerCase().includes("coors") ||
    venueName?.toLowerCase().includes("wrigley");
  const note =
    speed > 10
      ? isCoorsOrWrigley
        ? " (significant power impact at this park)"
        : " (moderate power impact)"
      : "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const dir = dirs[Math.round(deg / 45) % 8];
  return `${speed} mph ${dir}${note}`;
}

exports.handler = async (event) => {
  const { venue } = JSON.parse(event.body || "{}");
  const apiKey = process.env.WEATHER_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing WEATHER_API_KEY" }) };
  }

  const coords = findBallpark(venue);
  if (!coords) {
    return {
      statusCode: 200,
      body: JSON.stringify({ venue, note: "Ballpark coordinates not found", weather: null }),
    };
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=imperial`
    );
    const data = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        venue,
        weather: {
          temp: `${Math.round(data.main?.temp)}°F`,
          feelsLike: `${Math.round(data.main?.feels_like)}°F`,
          humidity: `${data.main?.humidity}%`,
          wind: describeWind(data.wind?.speed, data.wind?.deg, venue),
          conditions: data.weather?.[0]?.description,
          isIndoor: ["Chase Field", "Rogers Centre", "Minute Maid Park", "American Family Field", "Globe Life Field", "LoanDepot Park"].some(
            (p) => venue?.toLowerCase().includes(p.toLowerCase())
          ),
        },
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

module.exports.getWeather = async (venue) => {
  const apiKey = process.env.WEATHER_API_KEY;
  const coords = findBallpark(venue);
  if (!coords || !apiKey) return null;

  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=imperial`
  );
  const data = await res.json();
  return {
    temp: `${Math.round(data.main?.temp)}°F`,
    feelsLike: `${Math.round(data.main?.feels_like)}°F`,
    humidity: `${data.main?.humidity}%`,
    wind: describeWind(data.wind?.speed, data.wind?.deg, venue),
    conditions: data.weather?.[0]?.description,
    isIndoor: ["Chase Field", "Rogers Centre", "Minute Maid Park", "American Family Field", "Globe Life Field", "LoanDepot Park"].some(
      (p) => venue?.toLowerCase().includes(p.toLowerCase())
    ),
  };
};
