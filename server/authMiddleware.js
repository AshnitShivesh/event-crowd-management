const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("./db");

function requireAuth(req, res, next) {
  (async () => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Bearer access token required." });
    }
    const token = header.slice(7).trim();
    if (!token) return res.status(401).json({ error: "Bearer access token required." });
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
      return res.status(500).json({ error: "Authentication is not configured securely." });
    }
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret, {
        issuer: "event-crowd-management",
        audience: "event-crowd-management-client",
      });
    } catch (_) {
      return res.status(401).json({ error: "Invalid or expired access token." });
    }
    if (payload.type !== "access" || !payload.jti || !/^\d+$/.test(String(payload.sub))) {
      return res.status(401).json({ error: "Access token required; password-only challenges are not accepted." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await db.query(
      `SELECT s.id, s.user_id, s.expires_at, s.revoked_at,
              u.email, u.name, u.role, u.totp_enabled
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3`,
      [payload.jti, Number(payload.sub), tokenHash]
    );
    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || !session.totp_enabled) {
      return res.status(401).json({ error: "Session is invalid, expired, revoked, or MFA is not enabled." });
    }
    req.user = { id: session.user_id, email: session.email, name: session.name, role: session.role, sessionId: session.id };
    req.accessToken = token;
    await db.query("UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [session.id]);
    return next();
  })().catch((err) => {
    console.error("Authentication middleware failed:", err.message);
    return res.status(500).json({ error: "Unable to authenticate request." });
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Your role is not permitted to perform this operation." });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
