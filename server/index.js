const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./db");
const { requireAuth, requireRole } = require("./authMiddleware");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://event-crowd-management-gamma.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", require("./auth"));

io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token || "");
    const jwtSecret = process.env.JWT_SECRET;
    if (!token || !jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
      return next(new Error("Authentication required"));
    }

    const payload = jwt.verify(token, jwtSecret, {
      issuer: "event-crowd-management",
      audience: "event-crowd-management-client",
    });
    if (payload.type !== "access" || !payload.jti || !/^\d+$/.test(String(payload.sub))) {
      return next(new Error("Invalid access token"));
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await db.query(
      `SELECT s.id, s.expires_at, s.revoked_at, u.id AS user_id, u.role, u.totp_enabled
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3`,
      [payload.jti, Number(payload.sub), tokenHash]
    );
    const session = result.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || !session.totp_enabled) {
      return next(new Error("Session is invalid or expired"));
    }

    socket.data.user = { id: session.user_id, role: session.role };
    return next();
  } catch (_) {
    return next(new Error("Authentication required"));
  }
});

io.on("connection", socket => {
  console.log("Dashboard connected:", socket.id);

  socket.on("event:join", async (eventIdValue) => {
    const eventId = Number(eventIdValue);
    if (!Number.isInteger(eventId) || eventId <= 0) return;
    try {
      if (!(await canAccessEvent(socket.data.user, eventId))) return;
      for (const room of socket.rooms) {
        if (room.startsWith("event:")) socket.leave(room);
      }
      socket.join(`event:${eventId}`);
    } catch (err) {
      console.error("Socket event join failed:", err.message);
    }
  });

  socket.on("disconnect", () =>
    console.log("Dashboard disconnected:", socket.id)
  );
});

const error = (res, err) => {
  console.error("API request failed:", err.message);
  if (err.code === "23505") return res.status(409).json({ error: "A record with those details already exists." });
  if (err.code === "23503") return res.status(400).json({ error: "The request references a record that does not exist." });
  return res.status(500).json({ error: "An unexpected server error occurred." });
};

async function canAccessEvent(user, eventId) {
  const result = await db.query(
    `SELECT 1 FROM events e WHERE e.id = $1 AND (
       (e.organizer_id = $2 AND $3 = 'organizer') OR
       EXISTS (SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $2 AND m.role = $3)
     )`,
    [eventId, user.id, user.role]
  );
  return result.rows.length > 0;
}

/* BASIC */
app.get("/api/instance-check", (req, res) => {
  res.json({
    instance: require("os").hostname(),
    timestamp: new Date().toISOString()
  });
});
app.get("/", (req, res) =>
  res.json({
    message: "Event Crowd Management API",
    version: "1.0.0",
  })
);

app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "OK",
      database: "CONNECTED",
    });
  } catch (err) {
    res.status(500).json({
      status: "ERROR",
      database: "DISCONNECTED",
      error: err.message,
    });
  }
});

/* ACCOUNT AND EVENT MEMBERSHIPS */
app.get("/api/account", requireAuth, async (req, res) => {
  try {
    const userResult = await db.query("SELECT id, name, email, role, created_at, totp_enabled FROM users WHERE id = $1", [req.user.id]);
    let eventsResult;
    if (req.user.role === "organizer") {
      eventsResult = await db.query("SELECT id, name, description, start_time, end_time, status, created_at FROM events WHERE organizer_id = $1 ORDER BY id DESC", [req.user.id]);
    } else {
      eventsResult = await db.query(`SELECT e.id, e.name, e.description, e.start_time, e.end_time, e.status, e.created_at, m.role AS membership_role
        FROM event_memberships m JOIN events e ON e.id = m.event_id WHERE m.user_id = $1 ORDER BY e.id DESC`, [req.user.id]);
    }
    return res.json({ user: userResult.rows[0], events: eventsResult.rows });
  } catch (err) { return error(res, err); }
});


app.put("/api/account", requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || "");
    if (!name || name.length > 100) {
      return res.status(400).json({ error: "Name is required and must be 100 characters or fewer." });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: "Enter your current password to confirm these changes." });
    }
    const existing = await db.query("SELECT id, password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: "Account not found." });
    if (!(await bcrypt.compare(currentPassword, existing.rows[0].password_hash))) {
      return res.status(401).json({ error: "Your current password is incorrect." });
    }
    const updated = await db.query(
      `UPDATE users SET name = $1, email = $2
       WHERE id = $3
       RETURNING id, name, email, role, created_at, totp_enabled`,
      [name, email, req.user.id]
    );
    return res.json({ message: "Account updated successfully.", user: updated.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with that email already exists." });
    console.error("Account update failed:", err.message);
    return res.status(500).json({ error: "Unable to update account." });
  }
});

app.post("/api/events/:id/members", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const role = String(req.body.role || "").trim().toLowerCase();
    if (!email || !["staff", "viewer"].includes(role)) return res.status(400).json({ error: "A valid email and Staff or Viewer role are required." });
    const owned = await db.query("SELECT id FROM events WHERE id = $1 AND organizer_id = $2", [req.params.id, req.user.id]);
    if (!owned.rows.length) return res.status(404).json({ error: "Event not found or not owned by your account." });
    const user = await db.query("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
    if (!user.rows.length) return res.status(404).json({ error: "No account exists for that email. Ask the person to register first." });
    if (user.rows[0].role !== role) return res.status(400).json({ error: `That account's registered role is ${user.rows[0].role}. Choose ${user.rows[0].role} instead.` });
    await db.query(`INSERT INTO event_memberships (event_id, user_id, role) VALUES ($1, $2, $3)
      ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [req.params.id, user.rows[0].id, role]);
    return res.status(201).json({ message: `${user.rows[0].name} added to the event as ${role}.` });
  } catch (err) { return error(res, err); }
});

/* EVENTS */

app.get("/api/events", requireAuth, async (req, res) => {
  try {
    let query;
    let params = [req.user.id];
    if (req.user.role === "organizer") {
      query = `SELECT e.* FROM events e WHERE e.organizer_id = $1 ORDER BY e.id`;
    } else {
      query = `SELECT e.* FROM events e JOIN event_memberships m ON m.event_id = e.id WHERE m.user_id = $1 AND m.role = $2 ORDER BY e.id`;
      params = [req.user.id, req.user.role];
    }
    res.json((await db.query(query, params)).rows);
  } catch (err) { error(res, err); }
});

app.get("/api/events/:id", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.* FROM events e WHERE e.id = $1 AND (
        ( $2 = 'organizer' AND e.organizer_id = $3 ) OR
        EXISTS (SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $3 AND m.role = $2)
      )`,
      [req.params.id, req.user.role, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Event not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/events", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const {
      name,
      description,
      startTime,
      endTime,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Event name is required",
      });
    }

    const result = await db.query(
      `INSERT INTO events
       (name, description, start_time, end_time, organizer_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || null, startTime || null, endTime || null, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

app.put("/api/events/:id", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const { name, description, startTime, endTime } = req.body;
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ error: "Event name must be a non-empty string" });
    }

    const result = await db.query(
      `UPDATE events
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           start_time = COALESCE($3, start_time),
           end_time = COALESCE($4, end_time)
       WHERE id = $5 AND organizer_id = $6
       RETURNING *`,
      [
        name === undefined ? null : name.trim(),
        description === undefined ? null : description,
        startTime === undefined ? null : startTime,
        endTime === undefined ? null : endTime,
        req.params.id,
        req.user.id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Event not found or not owned by your account" });
    }
    return res.json({ message: "Event updated successfully", event: result.rows[0] });
  } catch (err) {
    return error(res, err);
  }
});

app.delete("/api/events/:id", requireAuth, requireRole("organizer"), async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const ownedEvent = await client.query("SELECT id FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE", [req.params.id, req.user.id]);
    if (!ownedEvent.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Event not found or not owned by your account." });
    }

    await client.query(
      `DELETE FROM tracking_events
       WHERE zone_id IN (
         SELECT id
         FROM zones
         WHERE event_id = $1
       )
       OR participant_id IN (
         SELECT id
         FROM participants
         WHERE event_id = $1
       )`,
      [req.params.id]
    );

    await client.query(
      `DELETE FROM alerts
       WHERE zone_id IN (
         SELECT id
         FROM zones
         WHERE event_id = $1
       )`,
      [req.params.id]
    );

    await client.query(
      `DELETE FROM participants
       WHERE event_id = $1`,
      [req.params.id]
    );

    const result = await client.query(
      "DELETE FROM events WHERE id = $1 AND organizer_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Event not found",
      });
    }

    await client.query("COMMIT");

    res.json({
      message: "Event deleted successfully",
      event: result.rows[0],
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    error(res, err);
  } finally {
    client.release();
  }
});

/* ZONES */

app.get("/api/events/:eventId/zones", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM zones
       WHERE event_id = $1 AND EXISTS (
         SELECT 1 FROM events e WHERE e.id = zones.event_id AND (
           (e.organizer_id = $2 AND $3 = 'organizer') OR
           EXISTS (SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $2 AND m.role = $3)
         )
       )
       ORDER BY id`,
      [req.params.eventId, req.user.id, req.user.role]
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/zones", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const {
      eventId,
      name,
      capacity,
    } = req.body;

    if (!eventId || !name || !capacity) {
      return res.status(400).json({
        error: "eventId, name and capacity are required",
      });
    }

    const ownedEvent = await db.query("SELECT id FROM events WHERE id = $1 AND organizer_id = $2", [eventId, req.user.id]);
    if (!ownedEvent.rows.length) return res.status(403).json({ error: "You can only add zones to events you organize." });

    const result = await db.query(
      `INSERT INTO zones
       (event_id, name, capacity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [eventId, name, capacity]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

/* CHECKPOINTS */

app.get("/api/checkpoints", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         c.*,
         z.name AS zone_name
       FROM checkpoints c
       JOIN zones z ON c.zone_id = z.id
       JOIN events e ON e.id = z.event_id
       WHERE (e.organizer_id = $1 AND $2 = 'organizer') OR EXISTS (
         SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $1 AND m.role = $2
       )
       ORDER BY c.id`, [req.user.id, req.user.role]
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/checkpoints", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const {
      zoneId,
      name,
      type,
      direction,
    } = req.body;

    if (!zoneId || !name || !direction) {
      return res.status(400).json({
        error: "zoneId, name and direction are required",
      });
    }

    const ownedZone = await db.query(`SELECT z.id FROM zones z JOIN events e ON e.id = z.event_id WHERE z.id = $1 AND e.organizer_id = $2`, [zoneId, req.user.id]);
    if (!ownedZone.rows.length) return res.status(403).json({ error: "You can only add checkpoints to zones in events you organize." });

    const result = await db.query(
      `INSERT INTO checkpoints
       (zone_id, name, type, direction)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        zoneId,
        name,
        type || "QR",
        direction,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

/* PARTICIPANTS */

app.get("/api/participants", requireAuth, async (req, res) => {
  try {
    const eventId = Number(req.query.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: "eventId is required to list participants for an event." });
    }
    if (!(await canAccessEvent(req.user, eventId))) {
      return res.status(403).json({ error: "You do not have access to this event." });
    }
    const result = await db.query(
      `SELECT p.* FROM participants p WHERE p.event_id = $1 ORDER BY p.id`,
      [eventId]
    );
    return res.json(result.rows);
  } catch (err) {
    return error(res, err);
  }
});

app.post("/api/participants", requireAuth, requireRole("organizer"), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim() || null;
    const token = String(req.body?.token || "").trim();
    const eventId = Number(req.body?.eventId);
    if (!name || !token || !Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: "name, token and eventId are required." });
    }
    if (!(await canAccessEvent(req.user, eventId))) {
      return res.status(403).json({ error: "You do not own this event." });
    }
    const result = await db.query(
      `INSERT INTO participants (name, email, token, event_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, email, token, eventId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A participant token or email already exists." });
    return error(res, err);
  }
});

/* TRACKING */

app.post("/api/tracking", requireAuth, requireRole("organizer", "staff"), async (req, res) => {
  const client = await db.connect();

  try {
    const {
      participantToken,
      checkpointId,
      direction,
      source,
    } = req.body;

    if (
      !participantToken ||
      !checkpointId ||
      !direction
    ) {
      return res.status(400).json({
        error:
          "participantToken, checkpointId and direction are required",
      });
    }

    if (!["ENTRY", "EXIT"].includes(direction)) {
      return res.status(400).json({
        error: "direction must be ENTRY or EXIT",
      });
    }

    await client.query("BEGIN");

    const allowedCheckpoint = await client.query(`SELECT c.id FROM checkpoints c JOIN zones z ON z.id = c.zone_id JOIN events e ON e.id = z.event_id
      WHERE c.id = $1 AND ((e.organizer_id = $2 AND $3 = 'organizer') OR EXISTS (
        SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $2 AND m.role = $3
      ))`, [checkpointId, req.user.id, req.user.role]);
    if (!allowedCheckpoint.rows.length) { await client.query("ROLLBACK"); return res.status(403).json({ error: "You are not assigned to the event for this checkpoint." }); }

    const participant = await client.query(
      `SELECT *
       FROM participants
       WHERE token = $1`,
      [participantToken]
    );

    if (!participant.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Participant not found",
      });
    }

    const checkpointEventResult = await client.query(
      `SELECT z.event_id FROM checkpoints c JOIN zones z ON z.id = c.zone_id WHERE c.id = $1`,
      [checkpointId]
    );

    if (!checkpointEventResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Checkpoint not found",
      });
    }

    if (
      !participant.rows[0].event_id ||
      Number(participant.rows[0].event_id) !== Number(checkpointEventResult.rows[0].event_id)
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This participant belongs to a different event or has not been assigned to an event." });
    }

    const checkpoint = await client.query(
      `SELECT
         c.*,
         z.name AS zone_name,
         z.capacity,
         z.current_occupancy,
         z.event_id
       FROM checkpoints c
       JOIN zones z ON c.zone_id = z.id
       WHERE c.id = $1`,
      [checkpointId]
    );

    if (!checkpoint.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Checkpoint not found",
      });
    }

    const zone = checkpoint.rows[0];

    const occupancyQuery =
      direction === "ENTRY"
        ? `UPDATE zones
           SET current_occupancy =
             LEAST(current_occupancy + 1, capacity)
           WHERE id = $1
           RETURNING *`
        : `UPDATE zones
           SET current_occupancy =
             GREATEST(current_occupancy - 1, 0)
           WHERE id = $1
           RETURNING *`;

    const updated = await client.query(
      occupancyQuery,
      [zone.zone_id]
    );

    const currentZone = updated.rows[0];

    const tracking = await client.query(
      `INSERT INTO tracking_events
       (
         participant_id,
         checkpoint_id,
         zone_id,
         direction,
         source
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        participant.rows[0].id,
        checkpointId,
        zone.zone_id,
        direction,
        source || "QR",
      ]
    );

    const utilization = currentZone.capacity
      ? (
          currentZone.current_occupancy /
          currentZone.capacity
        ) * 100
      : 0;

    const status =
      utilization >= 100
        ? "CRITICAL"
        : utilization >= 90
        ? "HIGH"
        : utilization >= 70
        ? "WARNING"
        : "NORMAL";

    if (
      status === "HIGH" ||
      status === "CRITICAL"
    ) {
      const existing = await client.query(
        `SELECT id
         FROM alerts
         WHERE zone_id = $1
         AND resolved = FALSE
         LIMIT 1`,
        [currentZone.id]
      );

      if (!existing.rows.length) {
        const message =
          status === "CRITICAL"
            ? `${currentZone.name} has reached capacity`
            : `${currentZone.name} is approaching capacity`;

        await client.query(
          `INSERT INTO alerts
           (zone_id, type, message)
           VALUES ($1, $2, $3)`,
          [
            currentZone.id,
            status,
            message,
          ]
        );
      }
    }

    if (status === "NORMAL") {
      await client.query(
        `UPDATE alerts
         SET resolved = TRUE
         WHERE zone_id = $1
         AND resolved = FALSE`,
        [currentZone.id]
      );
    }

    await client.query("COMMIT");

    const result = {
      trackingEvent: tracking.rows[0],
      zone: currentZone,
      utilization: Math.round(utilization),
      status,
    };

    io.to(`event:${zone.event_id}`).emit("tracking:update", result);

    res.status(201).json(result);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    error(res, err);
  } finally {
    client.release();
  }
});

/* TRACKING HISTORY */

app.get("/api/tracking", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         t.id,
         t.zone_id,
         p.name AS participant_name,
         p.token,
         c.name AS checkpoint_name,
         z.name AS zone_name,
         t.direction,
         t.source,
         t.timestamp
       FROM tracking_events t
       LEFT JOIN participants p
         ON t.participant_id = p.id
       LEFT JOIN checkpoints c
         ON t.checkpoint_id = c.id
       LEFT JOIN zones z
         ON t.zone_id = z.id
       JOIN events e ON e.id = z.event_id
       WHERE (e.organizer_id = $1 AND $2 = 'organizer') OR EXISTS (
         SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $1 AND m.role = $2
       )
       ORDER BY t.timestamp DESC`, [req.user.id, req.user.role]
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

/* DASHBOARD */

app.get("/api/dashboard/:eventId", requireAuth, async (req, res) => {
  try {
    const id = req.params.eventId;
    if (!(await canAccessEvent(req.user, id))) return res.status(403).json({ error: "You are not assigned to this event." });

    const zones = await db.query(
      `SELECT *
       FROM zones
       WHERE event_id = $1
       ORDER BY id`,
      [id]
    );

    const tracking = await db.query(
      `SELECT
         t.*,
         p.name AS participant_name,
         c.name AS checkpoint_name,
         z.name AS zone_name
       FROM tracking_events t
       JOIN participants p
         ON t.participant_id = p.id
       JOIN checkpoints c
         ON t.checkpoint_id = c.id
       JOIN zones z
         ON t.zone_id = z.id
       WHERE z.event_id = $1
       ORDER BY t.timestamp DESC`,
      [id]
    );

    const alerts = await db.query(
      `SELECT DISTINCT ON (a.zone_id)
         a.*,
         z.name AS zone_name
       FROM alerts a
       JOIN zones z
         ON a.zone_id = z.id
       WHERE z.event_id = $1
       AND a.resolved = FALSE
       ORDER BY
         a.zone_id,
         a.created_at DESC`,
      [id]
    );

    const totalCapacity = zones.rows.reduce(
      (sum, z) =>
        sum + Number(z.capacity),
      0
    );

    const totalOccupancy = zones.rows.reduce(
      (sum, z) =>
        sum + Number(z.current_occupancy),
      0
    );

    res.json({
      eventId: Number(id),
      totalCapacity,
      totalOccupancy,
      utilization: totalCapacity
        ? Math.round(
            (totalOccupancy /
              totalCapacity) *
              100
          )
        : 0,
      zones: zones.rows,
      recentTrackingEvents:
        tracking.rows.slice(0, 20),
      alerts: alerts.rows,
    });
  } catch (err) {
    error(res, err);
  }
});

/* ANALYTICS */

app.get("/api/analytics/:eventId", requireAuth, async (req, res) => {
  try {
    const id = req.params.eventId;
    if (!(await canAccessEvent(req.user, id))) return res.status(403).json({ error: "You are not assigned to this event." });

    const stats = await db.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE t.direction = 'ENTRY'
         ) AS total_entries,

         COUNT(*) FILTER (
           WHERE t.direction = 'EXIT'
         ) AS total_exits,

         COUNT(*) AS total_events

       FROM tracking_events t

       JOIN zones z
         ON t.zone_id = z.id

       WHERE z.event_id = $1`,
      [id]
    );

    const zones = await db.query(
      `SELECT
         name,
         capacity,
         current_occupancy,

         ROUND(
           (
             current_occupancy::numeric /
             capacity
           ) * 100,
           1
         ) AS utilization

       FROM zones

       WHERE event_id = $1

       ORDER BY current_occupancy DESC`,
      [id]
    );

    const row = stats.rows[0];

    res.json({
      totalEntries:
        Number(row.total_entries),

      totalExits:
        Number(row.total_exits),

      totalTrackingEvents:
        Number(row.total_events),

      busiestZone:
        zones.rows[0] || null,

      zones: zones.rows,
    });
  } catch (err) {
    error(res, err);
  }
});

/* ALERTS */

app.get("/api/alerts", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (a.zone_id)
         a.*,
         z.name AS zone_name
       FROM alerts a
       JOIN zones z ON a.zone_id = z.id
       JOIN events e ON e.id = z.event_id
       WHERE a.resolved = FALSE AND ((e.organizer_id = $1 AND $2 = 'organizer') OR EXISTS (
         SELECT 1 FROM event_memberships m WHERE m.event_id = e.id AND m.user_id = $1 AND m.role = $2
       ))
       ORDER BY a.zone_id, a.created_at DESC`, [req.user.id, req.user.role]
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

/* START SERVER */

server.listen(PORT, "0.0.0.0", () =>
  console.log(
    `Server running on port ${PORT}`
  )
);