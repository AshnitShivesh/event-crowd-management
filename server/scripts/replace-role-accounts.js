require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../db");

const required = [
  "NEW_ORGANIZER_NAME", "NEW_ORGANIZER_EMAIL", "NEW_ORGANIZER_PASSWORD",
  "NEW_STAFF_NAME", "NEW_STAFF_EMAIL", "NEW_STAFF_PASSWORD",
  "NEW_VIEWER_NAME", "NEW_VIEWER_EMAIL", "NEW_VIEWER_PASSWORD",
];

async function main() {
  if (process.env.CONFIRM_REPLACE_ACCOUNTS !== "true") {
    throw new Error("Refusing to replace accounts. Set CONFIRM_REPLACE_ACCOUNTS=true only after taking a database backup and reviewing this script.");
  }
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

  const definitions = [
    { role: "organizer", name: process.env.NEW_ORGANIZER_NAME, email: process.env.NEW_ORGANIZER_EMAIL, password: process.env.NEW_ORGANIZER_PASSWORD },
    { role: "staff", name: process.env.NEW_STAFF_NAME, email: process.env.NEW_STAFF_EMAIL, password: process.env.NEW_STAFF_PASSWORD },
    { role: "viewer", name: process.env.NEW_VIEWER_NAME, email: process.env.NEW_VIEWER_EMAIL, password: process.env.NEW_VIEWER_PASSWORD },
  ].map((account) => ({ ...account, name: account.name.trim(), email: account.email.trim().toLowerCase() }));

  if (new Set(definitions.map((account) => account.email)).size !== 3) throw new Error("The three account email addresses must be different.");
  for (const account of definitions) {
    if (!account.name || account.name.length > 100) throw new Error(`Invalid name for ${account.role}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email) || account.email.length > 254) throw new Error(`Invalid email for ${account.role}.`);
    if (account.password.length < 12 || Buffer.byteLength(account.password, "utf8") > 72) throw new Error(`Password for ${account.role} must be 12-72 bytes.`);
  }

  const prepared = [];
  for (const account of definitions) prepared.push({ ...account, passwordHash: await bcrypt.hash(account.password, 12) });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    await client.query(`CREATE TEMP TABLE previous_role_memberships ON COMMIT DROP AS
      SELECT DISTINCT m.event_id, u.role
      FROM event_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE u.role IN ('staff', 'viewer')`);
    await client.query("DELETE FROM auth_sessions");

    const ids = {};
    for (const account of prepared) {
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, role, totp_secret_encrypted, totp_pending_secret_encrypted, totp_enabled)
         VALUES ($1, $2, $3, $4, NULL, NULL, FALSE)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           totp_secret_encrypted = NULL,
           totp_pending_secret_encrypted = NULL,
           totp_enabled = FALSE
         RETURNING id`,
        [account.name, account.email, account.passwordHash, account.role]
      );
      ids[account.role] = result.rows[0].id;
    }

    // Preserve event ownership under the replacement organizer.
    await client.query("UPDATE events SET organizer_id = $1 WHERE organizer_id IS DISTINCT FROM $1", [ids.organizer]);

    // Merge old staff/viewer event memberships into the one replacement account per role.
    await client.query(
      `INSERT INTO event_memberships (event_id, user_id, role)
       SELECT DISTINCT event_id,
              CASE role WHEN 'staff' THEN $1 ELSE $2 END,
              role
       FROM previous_role_memberships
       ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [ids.staff, ids.viewer]
    );

    // Delete old identities, sessions and MFA state. Existing events are already reassigned;
    // role memberships have already been mapped to the replacement accounts.
    await client.query("DELETE FROM users WHERE id <> ALL($1::int[])", [[ids.organizer, ids.staff, ids.viewer]]);
    await client.query("COMMIT");

    console.log("Account replacement completed.");
    console.log("Created/updated one organizer, one staff, and one viewer account.");
    console.log("All existing events now belong to the replacement organizer.");
    console.log("Existing staff/viewer event memberships were merged by role.");
    console.log("All three accounts must enroll in authenticator MFA at their next sign-in.");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error("Account replacement failed:", err.message);
  process.exitCode = 1;
});
