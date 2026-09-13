const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./db");

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
    methods: ["GET", "POST", "DELETE"],
  },
});

app.use(cors());
app.use(express.json());

io.on("connection", socket => {
  console.log("Dashboard connected:", socket.id);

  socket.on("disconnect", () =>
    console.log("Dashboard disconnected:", socket.id)
  );
});

const error = (res, err) => res.status(500).json({ error: err.message });

/* BASIC */

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

/* EVENTS */

app.get("/api/events", async (req, res) => {
  try {
    res.json(
      (await db.query("SELECT * FROM events ORDER BY id")).rows
    );
  } catch (err) {
    error(res, err);
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM events WHERE id = $1",
      [req.params.id]
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

app.post("/api/events", async (req, res) => {
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
       (name, description, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name,
        description || null,
        startTime || null,
        endTime || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

app.delete("/api/events/:id", async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM tracking_events
       WHERE zone_id IN (
         SELECT id
         FROM zones
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

    const result = await client.query(
      "DELETE FROM events WHERE id = $1 RETURNING *",
      [req.params.id]
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
    await client.query("ROLLBACK");
    error(res, err);
  } finally {
    client.release();
  }
});

/* ZONES */

app.get("/api/events/:eventId/zones", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM zones
       WHERE event_id = $1
       ORDER BY id`,
      [req.params.eventId]
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/zones", async (req, res) => {
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

app.get("/api/checkpoints", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         c.*,
         z.name AS zone_name
       FROM checkpoints c
       JOIN zones z ON c.zone_id = z.id
       ORDER BY c.id`
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/checkpoints", async (req, res) => {
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

app.get("/api/participants", async (req, res) => {
  try {
    res.json(
      (await db.query(
        "SELECT * FROM participants ORDER BY id"
      )).rows
    );
  } catch (err) {
    error(res, err);
  }
});

app.post("/api/participants", async (req, res) => {
  try {
    const {
      name,
      email,
      token,
    } = req.body;

    if (!name || !token) {
      return res.status(400).json({
        error: "name and token are required",
      });
    }

    const result = await db.query(
      `INSERT INTO participants
       (name, email, token)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        name,
        email || null,
        token,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    error(res, err);
  }
});

/* TRACKING */

app.post("/api/tracking", async (req, res) => {
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

    const checkpoint = await client.query(
      `SELECT
         c.*,
         z.name AS zone_name,
         z.capacity,
         z.current_occupancy
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

    io.emit("tracking:update", result);

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

app.get("/api/tracking", async (req, res) => {
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
       ORDER BY t.timestamp DESC`
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

/* DASHBOARD */

app.get("/api/dashboard/:eventId", async (req, res) => {
  try {
    const id = req.params.eventId;

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

app.get("/api/analytics/:eventId", async (req, res) => {
  try {
    const id = req.params.eventId;

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

app.get("/api/alerts", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (a.zone_id)
         a.*,
         z.name AS zone_name
       FROM alerts a
       JOIN zones z
         ON a.zone_id = z.id
       WHERE a.resolved = FALSE
       ORDER BY
         a.zone_id,
         a.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    error(res, err);
  }
});

/* START SERVER */

server.listen(PORT, () =>
  console.log(
    `Server running on http://localhost:${PORT}`
  )
);
