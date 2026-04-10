// ============================================
// Cultiv8 — Express Server
// ============================================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { initDB } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- Serve static frontend files ----
app.use(express.static(path.join(__dirname, "public")));

// ---- API Routes ----
app.use("/api/auth", require("./routes/auth"));
app.use("/api/farms", require("./routes/farms"));
app.use("/api/storage", require("./routes/storage"));
app.use("/api", require("./routes/dashboard"));

// ---- Health check ----
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    name: "Cultiv8 API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// ---- API docs ----
app.get("/api", (req, res) => {
  res.json({
    name: "Cultiv8 API",
    version: "1.0.0",
    endpoints: {
      auth: {
        "POST /api/auth/signup": "Create new account (name, email, password, location)",
        "POST /api/auth/login": "Sign in (email, password)",
        "POST /api/auth/google": "Google Sign-In (credential)",
        "GET  /api/auth/me": "Get current user profile [auth]",
        "PUT  /api/auth/profile": "Update profile (name, location) [auth]"
      },
      farms: {
        "GET    /api/farms": "List all farms [auth]",
        "POST   /api/farms": "Register new farm [auth]",
        "GET    /api/farms/:id": "Get farm details [auth]",
        "PUT    /api/farms/:id": "Update farm [auth]",
        "DELETE /api/farms/:id": "Delete farm [auth]",
        "GET    /api/farms/stats/summary": "Carbon stats summary [auth]"
      },
      storage: {
        "GET    /api/storage": "List all storage entries [auth]",
        "POST   /api/storage": "Log new produce storage [auth]",
        "DELETE /api/storage/:id": "Delete storage entry [auth]",
        "GET    /api/storage/weather?lat=&lng=": "Get weather for location [auth]",
        "GET    /api/storage/spoilage-all": "Get all spoilage predictions [auth]",
        "GET    /api/storage/buyers": "Get matched buyers [auth]",
        "POST   /api/storage/contact-buyer": "Contact a buyer [auth]",
        "GET    /api/storage/stats": "Storage stats summary [auth]"
      },
      dashboard: {
        "GET  /api/dashboard": "Full dashboard data [auth]",
        "GET  /api/activities": "Recent activities [auth]",
        "GET  /api/alerts": "Active alerts [auth]",
        "PUT  /api/alerts/:id/read": "Mark alert as read [auth]",
        "GET  /api/marketplace": "Marketplace data [auth]",
        "POST /api/marketplace/sell": "Sell carbon credits [auth]"
      }
    }
  });
});

// ---- Catch-all: serve frontend ----
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- Start server ----
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════╗
║       🌱 Cultiv8 API Server             ║
║                                          ║
║  Running on: http://localhost:${PORT}      ║
║  API docs:   http://localhost:${PORT}/api  ║
║  Health:     http://localhost:${PORT}/api/health ║
║                                          ║
║  Database:   ${process.env.DB_PATH || "./cultiv8.db"}          ║
╚══════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
