// ============================================
// Cultiv8 — Farm Routes
// ============================================
const express = require("express");
const { queryAll, queryOne, runSQL } = require("../database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// Carbon sequestration rates (IPCC-based, tCO₂e/ha/yr)
const CARBON_RATES = {
  cover_crops: 0.32, no_till: 0.54, composting: 0.28,
  agroforestry: 1.20, crop_rotation: 0.18, mulching: 0.22
};

// ---- GET /api/farms/stats/summary ----
router.get("/stats/summary", authMiddleware, (req, res) => {
  const farms = queryAll("SELECT * FROM farms WHERE user_id = ?", [req.userId]);
  const totalCarbon = farms.reduce((sum, f) => sum + f.total_carbon, 0);
  const totalCredits = Math.floor(totalCarbon);
  const revenueNGN = Math.round(totalCarbon * 12.40 * 1580);

  res.json({
    farmCount: farms.length,
    totalCarbon: parseFloat(totalCarbon.toFixed(2)),
    totalCredits,
    revenueNGN,
    avgNDVI: farms.length ? parseFloat((farms.reduce((s, f) => s + f.ndvi, 0) / farms.length).toFixed(2)) : 0
  });
});

// ---- GET /api/farms ----
router.get("/", authMiddleware, (req, res) => {
  const farms = queryAll("SELECT * FROM farms WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
  farms.forEach(f => {
    f.practices = JSON.parse(f.practices || "[]");
    f.breakdown = JSON.parse(f.breakdown || "[]");
  });
  res.json({ farms });
});

// ---- GET /api/farms/:id ----
router.get("/:id", authMiddleware, (req, res) => {
  const farm = queryOne("SELECT * FROM farms WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!farm) return res.status(404).json({ error: "Farm not found." });
  farm.practices = JSON.parse(farm.practices || "[]");
  farm.breakdown = JSON.parse(farm.breakdown || "[]");
  res.json({ farm });
});

// ---- POST /api/farms ----
router.post("/", authMiddleware, (req, res) => {
  const { name, size, crop, lat, lng, practices } = req.body;

  if (!name || !size || !crop || lat == null || lng == null || !practices || !practices.length) {
    return res.status(400).json({ error: "All fields are required: name, size, crop, lat, lng, practices." });
  }

  // Calculate carbon sequestration
  let totalCarbon = 0;
  const breakdown = [];
  practices.forEach(p => {
    if (CARBON_RATES[p]) {
      const carbon = CARBON_RATES[p] * size;
      totalCarbon += carbon;
      breakdown.push({ practice: p, carbon: parseFloat(carbon.toFixed(3)) });
    }
  });
  totalCarbon = parseFloat(totalCarbon.toFixed(2));

  // Simulated NDVI and SOC
  const ndvi = parseFloat((0.35 + Math.random() * 0.45).toFixed(2));
  const soc = parseFloat((8 + Math.random() * 25).toFixed(1));

  runSQL(
    `INSERT INTO farms (user_id, name, size, crop, lat, lng, practices, total_carbon, breakdown, ndvi, soc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, name, size, crop, lat, lng, JSON.stringify(practices), totalCarbon, JSON.stringify(breakdown), ndvi, soc]
  );

  // Add activity
  runSQL("INSERT INTO activities (user_id, message, color) VALUES (?, ?, 'gn')",
    [req.userId, `Registered farm "${name}" (${size} ha)`]);

  // Get the inserted farm
  const farm = queryOne("SELECT * FROM farms WHERE user_id = ? ORDER BY id DESC LIMIT 1", [req.userId]);
  farm.practices = JSON.parse(farm.practices);
  farm.breakdown = JSON.parse(farm.breakdown);

  res.status(201).json({
    farm,
    message: `Farm "${name}" registered! Estimated ${totalCarbon} tCO₂e/year.`
  });
});

// ---- PUT /api/farms/:id ----
router.put("/:id", authMiddleware, (req, res) => {
  const existing = queryOne("SELECT * FROM farms WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!existing) return res.status(404).json({ error: "Farm not found." });

  const { name, size, crop, lat, lng, practices } = req.body;

  // Recalculate carbon if practices or size changed
  const newPractices = practices || JSON.parse(existing.practices);
  const newSize = size || existing.size;
  let totalCarbon = 0;
  const breakdown = [];
  newPractices.forEach(p => {
    if (CARBON_RATES[p]) {
      const carbon = CARBON_RATES[p] * newSize;
      totalCarbon += carbon;
      breakdown.push({ practice: p, carbon: parseFloat(carbon.toFixed(3)) });
    }
  });

  runSQL(
    `UPDATE farms SET name=?, size=?, crop=?, lat=?, lng=?, practices=?, total_carbon=?, breakdown=?
     WHERE id = ? AND user_id = ?`,
    [name || existing.name, newSize, crop || existing.crop, lat || existing.lat, lng || existing.lng,
     JSON.stringify(newPractices), parseFloat(totalCarbon.toFixed(2)), JSON.stringify(breakdown),
     req.params.id, req.userId]
  );

  const farm = queryOne("SELECT * FROM farms WHERE id = ?", [req.params.id]);
  farm.practices = JSON.parse(farm.practices);
  farm.breakdown = JSON.parse(farm.breakdown);
  res.json({ farm });
});

// ---- DELETE /api/farms/:id ----
router.delete("/:id", authMiddleware, (req, res) => {
  const existing = queryOne("SELECT * FROM farms WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  if (!existing) return res.status(404).json({ error: "Farm not found." });

  runSQL("DELETE FROM farms WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  runSQL("INSERT INTO activities (user_id, message, color) VALUES (?, ?, 'or')",
    [req.userId, `Removed farm "${existing.name}"`]);

  res.json({ message: "Farm deleted." });
});

module.exports = router;
