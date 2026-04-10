// ============================================
// Cultiv8 — Auth Middleware
// ============================================
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "cultiv8_dev_secret";

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware — attaches req.userId
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token. Please sign in again." });
  }
}

module.exports = { generateToken, verifyToken, authMiddleware };
