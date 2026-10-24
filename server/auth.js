const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const db = require("./db");

const router = express.Router();
const ACCESS_SECONDS = 30 * 60;
const CHALLENGE_SECONDS = 5 * 60;
const MIN_PASSWORD_LENGTH = 12;

function getSecrets() {
  const jwtSecret = process.env.JWT_SECRET;
  const encryptionHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes");
  }
  if (!encryptionHex || !/^[0-9a-fA-F]{64}$/.test(encryptionHex)) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a 64-character hex string");
  }
  return { jwtSecret, encryptionKey: Buffer.from(encryptionHex, "hex") };
}

function encryptSecret(secret) {
  const { encryptionKey } = getSecrets();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptSecret(value) {
  const { encryptionKey } = getSecrets();
  const parts = String(value || "").split(".");
  if (parts.length !== 3) throw new Error("Encrypted TOTP secret has an invalid format");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function signChallenge(user, type) {
  const { jwtSecret } = getSecrets();
  return jwt.sign({ sub: String(user.id), email: user.email, type }, jwtSecret, {
    expiresIn: CHALLENGE_SECONDS,
    issuer: "event-crowd-management",
    audience: "event-crowd-management-client",
  });
}

function verifyChallenge(token, expectedType) {
  const { jwtSecret } = getSecrets();
  const payload = jwt.verify(token, jwtSecret, {
    issuer: "event-crowd-management",
    audience: "event-crowd-management-client",
  });
  if (payload.type !== expectedType || !/^\d+$/.test(String(payload.sub))) {
    throw new Error("Invalid authentication challenge");
  }
  return payload;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueAccessToken(user) {
  const { jwtSecret } = getSecrets();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ACCESS_SECONDS * 1000);
  const token = jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, type: "access" },
    jwtSecret,
    {
      jwtid: sessionId,
      expiresIn: ACCESS_SECONDS,
      issuer: "event-crowd-management",
      audience: "event-crowd-management-client",
    }
  );
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, user.id, hashToken(token), expiresAt]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function verifyTotp(secret, token) {
  if (!/^\d{6}$/.test(String(token || ""))) return false;
  const otp = await import("otplib");
  const result = await otp.verify({ secret, token: String(token) });
  return result.valid === true;
}

router.get("/status", async (_req, res) => {
  try {
    const result = await db.query("SELECT EXISTS (SELECT 1 FROM users) AS has_users");
    return res.json({ needsBootstrap: !result.rows[0].has_users });
  } catch (err) {
    console.error("Auth status check failed:", err.message);
    return res.status(500).json({ error: "Unable to check account setup" });
  }
});

// One-time account creation retained for Q2(a); disabled by default after initial setup.
router.post("/bootstrap", async (req, res) => {
  if (process.env.ALLOW_INITIAL_BOOTSTRAP !== "true") {
    return res.status(403).json({ error: "Initial account setup is disabled." });
  }
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 ||
      password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Provide a name, valid email, and password of 12-72 bytes." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const count = await client.query("SELECT COUNT(*)::int AS count FROM users");
    if (count.rows[0].count !== 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Initial account setup has already been completed." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'organizer')
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash]
    );
    await client.query("COMMIT");
    return res.status(201).json({ message: "Organizer account created.", user: result.rows[0] });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    if (err.code === "23505") return res.status(409).json({ error: "An account with that email already exists." });
    console.error("Initial account creation failed:", err.message);
    return res.status(500).json({ error: "Unable to create the initial account." });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    const result = await db.query(
      "SELECT id, name, email, password_hash, role, totp_enabled FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!passwordOk) return res.status(401).json({ error: "Invalid email or password." });

    if (!user.totp_enabled) {
      const otp = await import("otplib");
      const secret = otp.generateSecret();
      const uri = otp.generateURI({ issuer: "Event Crowd Management", label: user.email, secret });
      const encrypted = encryptSecret(secret);
      await db.query("UPDATE users SET totp_pending_secret_encrypted = $1 WHERE id = $2", [encrypted, user.id]);
      const setupToken = signChallenge(user, "mfa_setup");
      const qrCodeDataUrl = await QRCode.toDataURL(uri);
      return res.json({
        requiresEnrollment: true,
        setupToken,
        qrCodeDataUrl,
        message: "Scan the QR code with an authenticator app, then submit the current six-digit code to /api/auth/mfa/verify.",
      });
    }

    const challengeToken = signChallenge(user, "mfa_pending");
    return res.json({ requiresMfa: true, challengeToken, message: "Submit your authenticator code to /api/auth/mfa/complete." });
  } catch (err) {
    console.error("Login failed:", err.message);
    return res.status(500).json({ error: "Unable to process login." });
  }
});

router.post("/mfa/verify", async (req, res) => {
  try {
    const setupToken = String(req.body.setupToken || "");
    const code = String(req.body.code || "");
    if (!setupToken || !code) return res.status(400).json({ error: "setupToken and code are required." });
    const challenge = verifyChallenge(setupToken, "mfa_setup");
    const result = await db.query(
      "SELECT id, name, email, role, totp_pending_secret_encrypted FROM users WHERE id = $1",
      [Number(challenge.sub)]
    );
    const user = result.rows[0];
    if (!user || !user.totp_pending_secret_encrypted) return res.status(400).json({ error: "MFA enrollment is not pending." });
    const secret = decryptSecret(user.totp_pending_secret_encrypted);
    if (!(await verifyTotp(secret, code))) return res.status(401).json({ error: "Invalid authenticator code." });
    await db.query(
      `UPDATE users
       SET totp_secret_encrypted = totp_pending_secret_encrypted,
           totp_pending_secret_encrypted = NULL,
           totp_enabled = TRUE
       WHERE id = $1`,
      [user.id]
    );
    const session = await issueAccessToken(user);
    return res.json({ message: "MFA enabled and login completed.", token: session.token, expiresAt: session.expiresAt, user: { id: user.id, name: user.name, email: user.email, role: user.role, totpEnabled: true } });
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid or expired setup token." });
    console.error("MFA enrollment verification failed:", err.message);
    return res.status(500).json({ error: "Unable to verify MFA enrollment." });
  }
});

router.post("/mfa/complete", async (req, res) => {
  try {
    const challengeToken = String(req.body.challengeToken || "");
    const code = String(req.body.code || "");
    if (!challengeToken || !code) return res.status(400).json({ error: "challengeToken and code are required." });
    const challenge = verifyChallenge(challengeToken, "mfa_pending");
    const result = await db.query(
      "SELECT id, name, email, role, totp_secret_encrypted, totp_enabled FROM users WHERE id = $1",
      [Number(challenge.sub)]
    );
    const user = result.rows[0];
    if (!user || !user.totp_enabled || !user.totp_secret_encrypted) return res.status(401).json({ error: "MFA is not enabled for this account." });
    if (!(await verifyTotp(decryptSecret(user.totp_secret_encrypted), code))) return res.status(401).json({ error: "Invalid authenticator code." });
    const session = await issueAccessToken(user);
    return res.json({ message: "Login successful.", token: session.token, expiresAt: session.expiresAt, user: { id: user.id, name: user.name, email: user.email, role: user.role, totpEnabled: true } });
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid or expired MFA challenge." });
    console.error("MFA completion failed:", err.message);
    return res.status(500).json({ error: "Unable to complete MFA." });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(400).json({ error: "Bearer access token is required." });
    const { jwtSecret } = getSecrets();
    const payload = jwt.verify(token, jwtSecret, { issuer: "event-crowd-management", audience: "event-crowd-management-client" });
    if (payload.type !== "access" || !payload.jti) return res.status(401).json({ error: "Invalid access token." });
    await db.query("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND token_hash = $2 AND revoked_at IS NULL", [payload.jti, hashToken(token)]);
    return res.json({ message: "Logged out; session revoked." });
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid or expired access token." });
    console.error("Logout failed:", err.message);
    return res.status(500).json({ error: "Unable to log out." });
  }
});

module.exports = router;
