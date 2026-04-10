// ============================================
// Cultiv8 — Dashboard, Activities, Alerts, Marketplace
// ============================================
const express = require("express");
const { queryAll, queryOne, runSQL } = require("../database");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// Corporate buyers for marketplace
const MARKETPLACE_BUYERS = [
  { name: "GreenCorp International", price: 13.20, qty: "500 tCO₂e", std: "Verra VCS", color: "#0078D4" },
  { name: "Nestlé Sustainability Fund", price: 11.80, qty: "1,200 tCO₂e", std: "Gold Standard", color: "#E74C3C" },
  { name: "TotalEnergies Carbon Offset", price: 12.90, qty: "800 tCO₂e", std: "Verra VCS", color: "#2ECC71" },
  { name: "Unilever Green Impact", price: 14.10, qty: "350 tCO₂e", std: "Gold Standard", color: "#F39C12" },
];

// ---- GET /api/dashboard ----
router.get("/dashboard", authMiddleware, (req, res) => {
  // Farms summary
  const farms = queryAll("SELECT * FROM farms WHERE user_id = ?", [req.userId]);
  const totalCarbon = farms.reduce((s, f) => s + f.total_carbon, 0);
  const revenueNGN = Math.round(totalCarbon * 12.40 * 1580);

  // Storage summary
  const storage = queryAll("SELECT * FROM storage WHERE user_id = ?", [req.userId]);
  const totalStored = storage.reduce((s, i) => s + i.qty, 0);
  let savedKg = 0;
  let urgentCount = 0;
  storage.forEach(i => {
    const sp = JSON.parse(i.spoilage || "{}");
    if (sp.status === "safe") savedKg += i.qty * 0.35;
    if (sp.status !== "safe") urgentCount++;
  });

  // Recent activities
  const activities = queryAll(
    "SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [req.userId]
  );

  // Alerts
  const alerts = queryAll(
    "SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [req.userId]
  );

  res.json({
    stats: {
      farmCount: farms.length,
      totalCarbon: parseFloat(totalCarbon.toFixed(2)),
      revenueNGN,
      totalStored: Math.round(totalStored),
      savedKg: Math.round(savedKg),
      savedValueNGN: Math.round(savedKg * 250),
      urgentCount,
      storageCount: storage.length
    },
    activities,
    alerts,
    farms: farms.map(f => ({ ...f, practices: JSON.parse(f.practices || "[]") })),
    storage: storage.map(s => ({
      ...s,
      weather: JSON.parse(s.weather || "{}"),
      spoilage: JSON.parse(s.spoilage || "{}")
    }))
  });
});

// ---- GET /api/activities ----
router.get("/activities", authMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const activities = queryAll(
    "SELECT * FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [req.userId, limit]
  );
  res.json({ activities });
});

// ---- GET /api/alerts ----
router.get("/alerts", authMiddleware, (req, res) => {
  const alerts = queryAll(
    "SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [req.userId]
  );
  res.json({ alerts });
});

// ---- PUT /api/alerts/:id/read ----
router.put("/alerts/:id/read", authMiddleware, (req, res) => {
  runSQL("UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
  res.json({ message: "Alert marked as read." });
});

// ---- GET /api/marketplace ----
router.get("/marketplace", authMiddleware, (req, res) => {
  const farms = queryAll("SELECT * FROM farms WHERE user_id = ?", [req.userId]);
  const totalCarbon = farms.reduce((s, f) => s + f.total_carbon, 0);
  const totalCredits = parseFloat(totalCarbon.toFixed(2));
  const revenueNGN = Math.round(totalCarbon * 12.40 * 1580);

  // Transaction history
  const transactions = queryAll(
    "SELECT * FROM carbon_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [req.userId]
  );

  res.json({
    availableCredits: totalCredits,
    currentPrice: 12.40,
    revenueNGN,
    buyers: MARKETPLACE_BUYERS,
    transactions
  });
});

// ---- POST /api/marketplace/sell ----
router.post("/marketplace/sell", authMiddleware, (req, res) => {
  const { farmId, buyerName, tonnes } = req.body;

  if (!farmId || !buyerName || !tonnes) {
    return res.status(400).json({ error: "farmId, buyerName, and tonnes are required." });
  }

  const farm = queryOne("SELECT * FROM farms WHERE id = ? AND user_id = ?", [farmId, req.userId]);
  if (!farm) return res.status(404).json({ error: "Farm not found." });

  const buyer = MARKETPLACE_BUYERS.find(b => b.name === buyerName);
  const pricePerTonne = buyer ? buyer.price : 12.40;
  const totalNGN = Math.round(tonnes * pricePerTonne * 1580);

  runSQL(
    `INSERT INTO carbon_transactions (user_id, farm_id, buyer_name, tonnes, price_per_tonne, total_ngn, status)
     VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
    [req.userId, farmId, buyerName, tonnes, pricePerTonne, totalNGN]
  );

  runSQL("INSERT INTO activities (user_id, message, color) VALUES (?, ?, 'gn')",
    [req.userId, `Sold ${tonnes} tCO₂e to ${buyerName} for ₦${totalNGN.toLocaleString()}`]);

  res.json({ message: `Sold ${tonnes} tCO₂e to ${buyerName} for ₦${totalNGN.toLocaleString()}!` });
});

module.exports = router;
