// ============================================
// Cultiv8 — Storage & Post-Harvest Routes
// ============================================
const express = require("express");
const { queryAll, queryOne, runSQL } = require("../database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// FAO-based spoilage models
const SPOILAGE = {
  tomatoes:  { bd: 14, it: 13, ir: 85, tf: 0.8,  hf: 0.15, icon: "🍅" },
  maize:     { bd: 180, it: 15, ir: 45, tf: 0.3,  hf: 0.5,  icon: "🌽" },
  rice:      { bd: 365, it: 15, ir: 40, tf: 0.2,  hf: 0.4,  icon: "🍚" },
  cassava:   { bd: 3,   it: 20, ir: 85, tf: 0.5,  hf: 0.2,  icon: "🥔" },
  yam:       { bd: 90,  it: 16, ir: 70, tf: 0.4,  hf: 0.3,  icon: "🍠" },
  peppers:   { bd: 21,  it: 8,  ir: 90, tf: 0.6,  hf: 0.2,  icon: "🌶️" },
  onions:    { bd: 120, it: 0,  ir: 65, tf: 0.25, hf: 0.35, icon: "🧅" },
  beans:     { bd: 365, it: 15, ir: 40, tf: 0.15, hf: 0.4,  icon: "🫘" },
  plantain:  { bd: 10,  it: 14, ir: 85, tf: 0.7,  hf: 0.15, icon: "🍌" },
  oranges:   { bd: 56,  it: 5,  ir: 90, tf: 0.5,  hf: 0.2,  icon: "🍊" }
};

const STORAGE_MULT = {
  open_air: 0.5, covered_room: 0.75, hermetic_bag: 1.2,
  traditional_silo: 0.9, cold_storage: 2.0
};

const STORAGE_NAMES = {
  open_air: "Open Air", covered_room: "Covered Room", hermetic_bag: "Hermetic Bags",
  traditional_silo: "Traditional Silo", cold_storage: "Cold Storage"
};

// Nearby buyers database
const BUYERS = [
  { name: "Mama Nkechi Market", type: "Market Trader", distance: "3.2 km", crops: ["tomatoes","peppers","onions","plantain"], color: "#e74c3c" },
  { name: "FreshCo Aggregators", type: "Aggregator", distance: "8.5 km", crops: ["maize","rice","beans","yam"], color: "#3498db" },
  { name: "Oyo Cold Storage Hub", type: "Cold Storage", distance: "15 km", crops: ["tomatoes","peppers","oranges","plantain"], color: "#2ecc71" },
  { name: "AgroTrade Nigeria", type: "Export Buyer", distance: "22 km", crops: ["cassava","beans","rice"], color: "#9b59b6" },
  { name: "Iya Basira Foods", type: "Processor", distance: "5.8 km", crops: ["cassava","maize","tomatoes","peppers"], color: "#f39c12" },
];

// Calculate spoilage
function calcSpoilage(crop, method, weather) {
  const m = SPOILAGE[crop];
  if (!m) return { daysLeft: 30, quality: 80, status: "safe", advice: "No model for this crop." };

  let bd = m.bd * (STORAGE_MULT[method] || 0.75);
  const tDiff = Math.max(0, weather.temp - m.it);
  bd -= tDiff * m.tf;
  const hDiff = Math.abs(weather.humidity - m.ir);
  bd -= (hDiff / 100) * m.hf * m.bd;

  const dl = Math.max(1, Math.round(bd));
  const q = Math.min(100, Math.max(5, Math.round((dl / (m.bd * 2)) * 100)));
  const st = dl <= 3 ? "danger" : dl <= 7 ? "warning" : "safe";

  let advice = "";
  const cap = crop.charAt(0).toUpperCase() + crop.slice(1);
  if (st === "danger") advice = `URGENT: ${cap} may spoil in ${dl} day(s). ${weather.temp.toFixed(1)}°C is accelerating decay. Sell immediately.`;
  else if (st === "warning") advice = `Plan to sell ${cap} within ${dl} days. Current conditions (${weather.temp.toFixed(1)}°C, ${weather.humidity.toFixed(0)}% RH) are reducing shelf life.`;
  else advice = `${cap} is stable at ${weather.temp.toFixed(1)}°C. ~${dl} days remaining. Monitor weather changes.`;

  return { daysLeft: dl, quality: q, status: st, advice };
}

// Fetch weather from Open-Meteo
async function fetchWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      temp: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      wind: data.current.wind_speed_10m,
      precipitation: data.current.precipitation,
      forecast: data.daily ? {
        dates: data.daily.time,
        tempMax: data.daily.temperature_2m_max,
        tempMin: data.daily.temperature_2m_min,
        rainProb: data.daily.precipitation_probability_max
      } : null
    };
  } catch (e) {
    // Fallback simulated data
    return {
      temp: 28 + Math.random() * 8,
      humidity: 55 + Math.random() * 30,
      wind: 5 + Math.random() * 15,
      precipitation: Math.random() > 0.7 ? Math.random() * 5 : 0,
      forecast: null
    };
  }
}

// ---- GET /api/storage ----
router.get("/", authMiddleware, (req, res) => {
  const items = queryAll("SELECT * FROM storage WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
  items.forEach(s => {
    s.weather = JSON.parse(s.weather || "{}");
    s.spoilage = JSON.parse(s.spoilage || "{}");
  });
  res.json({ storage: items });
});

// ---- POST /api/storage ----
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { crop, qty, method, lat, lng } = req.body;

    if (!crop || !qty || !method || lat == null || lng == null) {
      return res.status(400).json({ error: "All fields required: crop, qty, method, lat, lng." });
    }

    // Fetch real weather
    const weather = await fetchWeather(lat, lng);
    const spoilage = calcSpoilage(crop, method, weather);

    runSQL(
      `INSERT INTO storage (user_id, crop, qty, method, lat, lng, weather, spoilage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, crop, qty, method, lat, lng, JSON.stringify(weather), JSON.stringify(spoilage)]
    );

    // Add activity
    const methodName = STORAGE_NAMES[method] || method;
    runSQL("INSERT INTO activities (user_id, message, color) VALUES (?, ?, 'or')",
      [req.userId, `Logged ${qty} kg ${crop} in ${methodName}`]);

    // Add alert if needed
    if (spoilage.status === "danger") {
      runSQL("INSERT INTO alerts (user_id, message, type) VALUES (?, ?, 'crit')",
        [req.userId, `URGENT: ${crop} will spoil in ~${spoilage.daysLeft} days!`]);
    } else if (spoilage.status === "warning") {
      runSQL("INSERT INTO alerts (user_id, message, type) VALUES (?, ?, 'warn')",
        [req.userId, `Warning: ${crop} has ~${spoilage.daysLeft} days remaining.`]);
    }

    const item = queryOne("SELECT * FROM storage WHERE user_id = ? ORDER BY id DESC LIMIT 1", [req.userId]);
    item.weather = JSON.parse(item.weather);
    item.spoilage = JSON.parse(item.spoilage);

    res.status(201).json({
      storage: item,
      weather,
      spoilage,
      message: `${crop} logged! ~${spoilage.daysLeft} days shelf life.`
    });
  } catch (err) {
    console.error("Storage log error:", err);
    res.status(500).json({ error: "Failed to log storage." });
  }
});

// ---- DELETE /api/storage/:id ----
router.delete("/:id", authMiddleware, (req, res) => {
  const item = queryOne("SELECT * FROM storage WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!item) return res.status(404).json({ error: "Storage entry not found." });

  runSQL("DELETE FROM storage WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  res.json({ message: "Storage entry deleted." });
});

// ---- GET /api/storage/weather?lat=&lng= ----
router.get("/weather", authMiddleware, async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required." });
  const weather = await fetchWeather(parseFloat(lat), parseFloat(lng));
  res.json({ weather });
});

// ---- GET /api/storage/spoilage-all ----
router.get("/spoilage-all", authMiddleware, (req, res) => {
  const items = queryAll("SELECT * FROM storage WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
  items.forEach(s => {
    s.weather = JSON.parse(s.weather || "{}");
    s.spoilage = JSON.parse(s.spoilage || "{}");
  });
  res.json({ storage: items });
});

// ---- GET /api/storage/buyers ----
router.get("/buyers", authMiddleware, (req, res) => {
  const items = queryAll("SELECT * FROM storage WHERE user_id = ?", [req.userId]);
  const crops = [...new Set(items.map(s => s.crop))];

  const matched = BUYERS.map(b => {
    const matchingCrops = b.crops.filter(c => crops.includes(c));
    return { ...b, matchingCrops, relevance: matchingCrops.length };
  }).filter(b => b.relevance > 0).sort((a, b) => b.relevance - a.relevance);

  res.json({ buyers: matched.length > 0 ? matched : BUYERS });
});

// ---- POST /api/storage/contact-buyer ----
router.post("/contact-buyer", authMiddleware, (req, res) => {
  const { storageId, buyerName, buyerType } = req.body;

  runSQL(
    "INSERT INTO buyer_contacts (user_id, storage_id, buyer_name, buyer_type) VALUES (?, ?, ?, ?)",
    [req.userId, storageId || 0, buyerName, buyerType]
  );

  runSQL("INSERT INTO activities (user_id, message, color) VALUES (?, ?, 'bl')",
    [req.userId, `Contacted buyer: ${buyerName}`]);

  res.json({ message: `Request sent to ${buyerName}!` });
});

// ---- GET /api/storage/stats ----
router.get("/stats", authMiddleware, (req, res) => {
  const items = queryAll("SELECT * FROM storage WHERE user_id = ?", [req.userId]);
  const totalStored = items.reduce((s, i) => s + i.qty, 0);

  let savedKg = 0;
  items.forEach(i => {
    const sp = JSON.parse(i.spoilage || "{}");
    if (sp.status === "safe") savedKg += i.qty * 0.35;
  });

  const urgent = items.filter(i => {
    const sp = JSON.parse(i.spoilage || "{}");
    return sp.status !== "safe";
  }).length;

  res.json({
    totalStored: Math.round(totalStored),
    savedKg: Math.round(savedKg),
    savedValueNGN: Math.round(savedKg * 250),
    itemCount: items.length,
    urgentCount: urgent
  });
});

module.exports = router;
