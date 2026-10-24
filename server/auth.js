const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("./db");

const router = express.Router();
const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_ROUNDS = 12;

router.get("/status", async (_req, res) => {
  try {
    const result = await db.query("SELECT EXISTS (SELECT 1 FROM users) AS has_users");
    res.json({ needsBootstrap: !result.rows[0].has_users });
  } catch (err) {
    console.error("Auth status check failed:", err.message);
    res.status(500).json({ error: "Unable to check account setup" });
  }
});

// One-time account creation for Q2(a). This endpoint is disabled by default.
// Set ALLOW_INITIAL_BOOTSTRAP=true only while creating the first organizer,
// then set it back to false and restart the backend.
router.post("/bootstrap", async (req, res) => {
  if (process.env.ALLOW_INITIAL_BOOTSTRAP !== "true") {
    return res.status(403).json({
      error: "Initial account setup is disabled. Enable it temporarily to create the first organizer account.",
    });
  }

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (
    !name || name.length > 100 ||
    !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 ||
    password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      error: "Provide a name, valid email, and password of 12–72 bytes.",
    });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const countResult = await client.query("SELECT COUNT(*)::int AS count FROM users");

    if (countResult.rows[0].count !== 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Initial account setup has already been completed." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'organizer')
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      message: "Organizer account created. The password was stored as a bcrypt hash, not plaintext.",
      user: result.rows[0],
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_rollbackError) {}
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    console.error("Initial account creation failed:", err.message);
    return res.status(500).json({ error: "Unable to create the initial account." });
  } finally {
    client.release();
  }
});

module.exports = router;
