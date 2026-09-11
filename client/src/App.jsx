import { useEffect, useState } from "react";
import {
  getEvents,
  createEvent,
  getZones,
  createZone,
  getCheckpoints,
  createCheckpoint,
  getParticipants,
  createParticipant,
  recordTrackingEvent,
  getTrackingEvents,
  getDashboard,
  getAnalytics,
  getAlerts,
} from "./api";
import "./index.css";

function App() {
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [trackingEvents, setTrackingEvents] = useState([]);

  const [selectedEvent, setSelectedEvent] = useState("");
  const [mode, setMode] = useState("LIVE");

  const [eventForm, setEventForm] = useState({
    name: "",
    description: "",
    start_time: "",
    end_time: "",
  });

  const [zoneForm, setZoneForm] = useState({
    name: "",
    capacity: "",
  });

  const [checkpointForm, setCheckpointForm] = useState({
    name: "",
    zone_id: "",
    type: "QR",
    direction: "ENTRY",
  });

  const [participantForm, setParticipantForm] = useState({
    name: "",
    email: "",
    token: "",
  });

  const [trackingForm, setTrackingForm] = useState({
    token: "",
    checkpoint_id: "",
    direction: "ENTRY",
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    loadEvents();
    loadCheckpoints();
    loadParticipants();
    loadTrackingEvents();
    loadAlerts();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadEventData(selectedEvent);
    }
  }, [selectedEvent]);

  async function loadEvents() {
    try {
      const data = await getEvents();
      setEvents(data);

      if (data.length > 0 && !selectedEvent) {
        setSelectedEvent(data[0].id);
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadEventData(eventId) {
    try {
      const [zoneData, dashboardData, analyticsData] =
        await Promise.all([
          getZones(eventId),
          getDashboard(eventId),
          getAnalytics(eventId),
        ]);

      setZones(zoneData);
      setDashboard(dashboardData);
      setAnalytics(analyticsData);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadCheckpoints() {
    try {
      const data = await getCheckpoints();
      setCheckpoints(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadParticipants() {
    try {
      const data = await getParticipants();
      setParticipants(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadTrackingEvents() {
    try {
      const data = await getTrackingEvents();
      setTrackingEvents(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadAlerts() {
    try {
      const data = await getAlerts();
      setAlerts(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function refreshData() {
    if (!selectedEvent) return;

    await Promise.all([
      loadEventData(selectedEvent),
      loadTrackingEvents(),
      loadAlerts(),
    ]);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();

    try {
      await createEvent(eventForm);

      const updatedEvents = await getEvents();
      setEvents(updatedEvents);

      // Select the newly created event
      if (updatedEvents.length > 0) {
        const newestEvent = updatedEvents.reduce((latest, event) =>
          Number(event.id) > Number(latest.id) ? event : latest
        );

        setSelectedEvent(newestEvent.id);
        await loadEventData(newestEvent.id);
      }

      setEventForm({
        name: "",
        description: "",
        start_time: "",
        end_time: "",
      });

      setMessage("Event created successfully.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCreateZone(e) {
    e.preventDefault();

    if (!selectedEvent) {
      setMessage("Select an event first.");
      return;
    }

    try {
      await createZone({
        event_id: selectedEvent,
        name: zoneForm.name,
        capacity: Number(zoneForm.capacity),
      });

      setZoneForm({
        name: "",
        capacity: "",
      });

      setMessage("Zone created successfully.");
      await loadEventData(selectedEvent);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCreateCheckpoint(e) {
    e.preventDefault();

    if (!checkpointForm.zone_id) {
      setMessage("Select a zone first.");
      return;
    }

    try {
      await createCheckpoint({
        zone_id: Number(checkpointForm.zone_id),
        name: checkpointForm.name,
        type: checkpointForm.type,
        direction: checkpointForm.direction,
      });

      setCheckpointForm({
        name: "",
        zone_id: "",
        type: "QR",
        direction: "ENTRY",
      });

      setMessage("Checkpoint created successfully.");
      await loadCheckpoints();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCreateParticipant(e) {
    e.preventDefault();

    try {
      await createParticipant(participantForm);

      setParticipantForm({
        name: "",
        email: "",
        token: "",
      });

      setMessage("Participant created successfully.");
      await loadParticipants();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleTracking(e) {
    e.preventDefault();

    try {
      const result = await recordTrackingEvent({
        token: trackingForm.token,
        checkpoint_id: Number(trackingForm.checkpoint_id),
        direction: trackingForm.direction,
        source: mode === "DEMO" ? "SIMULATOR" : "QR",
      });

      setMessage(result.message || "Tracking event recorded.");

      setTrackingForm({
        ...trackingForm,
        token: "",
      });

      await refreshData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function simulateTracking(type) {
    if (!checkpoints.length || !participants.length) {
      setMessage(
        "Create at least one checkpoint and participant first."
      );
      return;
    }

    const checkpoint = checkpoints[0];

    try {
      if (type === "SURGE") {
        for (let i = 0; i < 5; i++) {
          const participant =
            participants[i % participants.length];

          await recordTrackingEvent({
            token: participant.token,
            checkpoint_id: checkpoint.id,
            direction: "ENTRY",
            source: "SIMULATOR",
          });
        }

        setMessage("Surge scenario simulated.");
      }

      if (type === "CLEARING") {
        for (let i = 0; i < 3; i++) {
          const participant =
            participants[i % participants.length];

          await recordTrackingEvent({
            token: participant.token,
            checkpoint_id: checkpoint.id,
            direction: "EXIT",
            source: "SIMULATOR",
          });
        }

        setMessage("Clearing scenario simulated.");
      }

      if (type === "NORMAL") {
        const participant = participants[0];

        await recordTrackingEvent({
          token: participant.token,
          checkpoint_id: checkpoint.id,
          direction: "ENTRY",
          source: "SIMULATOR",
        });

        setMessage("Normal activity simulated.");
      }

      await refreshData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const selectedEventObject = events.find(
    (event) => event.id === Number(selectedEvent)
  );

  const recentEvents = trackingEvents.slice(0, 5);

  return (
    <>
      <header>
        <div>
          <h1>Event Crowd Management System</h1>
          <p>Real-time crowd monitoring and decision support</p>
        </div>

        <div className="mode-buttons">
          <button
            className={mode === "LIVE" ? "active live" : ""}
            onClick={() => setMode("LIVE")}
          >
            LIVE
          </button>

          <button
            className={mode === "DEMO" ? "active demo" : ""}
            onClick={() => setMode("DEMO")}
          >
            DEMO
          </button>
        </div>
      </header>

      <main>
        {message && (
          <div className="message">
            {message}
            <button onClick={() => setMessage("")}>×</button>
          </div>
        )}

        {/* EVENT DASHBOARD */}

        <section>
          <h2>Event Dashboard</h2>

          <div className="event-selector">
            <label>Select Event</label>

            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
            >
              <option value="">Select an event</option>

              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>

            {selectedEventObject && (
              <p>{selectedEventObject.description}</p>
            )}
          </div>
        </section>

        {/* OVERVIEW */}

        {selectedEvent && dashboard && (
          <section>
            <h2>Overview</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Capacity</h3>
                <strong>
                  {dashboard.total_capacity ?? 0}
                </strong>
              </div>

              <div className="stat-card">
                <h3>Current Occupancy</h3>
                <strong>
                  {dashboard.total_occupancy ?? 0}
                </strong>
              </div>

              <div className="stat-card">
                <h3>Utilization</h3>
                <strong>
                  {dashboard.total_capacity
                    ? Math.round(
                        (dashboard.total_occupancy /
                          dashboard.total_capacity) *
                          100
                      )
                    : 0}
                  %
                </strong>
              </div>

              <div className="stat-card">
                <h3>Active Alerts</h3>
                <strong>{alerts.length}</strong>
              </div>
            </div>
          </section>
        )}

        {/* ZONE OVERVIEW */}

        {selectedEvent && (
          <section>
            <h2>Zone Overview</h2>

            {zones.length === 0 ? (
              <p>No zones configured yet.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th>Capacity</th>
                      <th>Occupancy</th>
                      <th>Utilization</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {zones.map((zone) => {
                      const utilization =
                        zone.capacity > 0
                          ? Math.round(
                              (zone.current_occupancy /
                                zone.capacity) *
                                100
                            )
                          : 0;

                      let status = "NORMAL";

                      if (utilization >= 100) {
                        status = "CRITICAL";
                      } else if (utilization >= 90) {
                        status = "HIGH";
                      } else if (utilization >= 75) {
                        status = "WARNING";
                      }

                      return (
                        <tr key={zone.id}>
                          <td>{zone.name}</td>
                          <td>{zone.capacity}</td>
                          <td>{zone.current_occupancy}</td>

                          <td>
                            <div className="utilization-container">
                              <div className="utilization-bar">
                                <div
                                  className="utilization-fill"
                                  style={{
                                    width: `${Math.min(
                                      utilization,
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>

                              <span>{utilization}%</span>
                            </div>
                          </td>

                          <td>
                            <span
                              className={`status ${status.toLowerCase()}`}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ANALYTICS */}

        {analytics && (
          <section>
            <h2>Event Analytics</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Entries</h3>
                <strong>
                  {analytics.total_entries ?? 0}
                </strong>
              </div>

              <div className="stat-card">
                <h3>Total Exits</h3>
                <strong>
                  {analytics.total_exits ?? 0}
                </strong>
              </div>

              <div className="stat-card">
                <h3>Tracking Events</h3>
                <strong>
                  {analytics.total_tracking_events ?? 0}
                </strong>
              </div>

              <div className="stat-card">
                <h3>Busiest Zone</h3>
                <strong>
                  {analytics.busiest_zone || "N/A"}
                </strong>
              </div>
            </div>
          </section>
        )}

        {/* ACTIVE ALERTS */}

        <section>
          <h2>Active Alerts</h2>

          {alerts.length === 0 ? (
            <div className="no-alerts">
              <strong>No active alerts</strong>
              <p>
                All monitored zones are currently operating normally.
              </p>
            </div>
          ) : (
            <div className="alerts-list">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`alert-item ${alert.type.toLowerCase()}`}
                >
                  <strong>
                    {alert.type} — Zone {alert.zone_name}
                  </strong>

                  <p>{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* EVENT SETUP */}

        <section>
          <h2>Event Setup</h2>

          <div className="form-grid">
            {/* CREATE EVENT */}

            <form onSubmit={handleCreateEvent}>
              <h3>Create Event</h3>

              <input
                placeholder="Event name"
                value={eventForm.name}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    name: e.target.value,
                  })
                }
                required
              />

              <textarea
                placeholder="Description"
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    description: e.target.value,
                  })
                }
              />

              <label>Start Time</label>

              <input
                type="datetime-local"
                value={eventForm.start_time}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    start_time: e.target.value,
                  })
                }
              />

              <label>End Time</label>

              <input
                type="datetime-local"
                value={eventForm.end_time}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    end_time: e.target.value,
                  })
                }
              />

              <button type="submit">Create Event</button>
            </form>

            {/* CREATE ZONE */}

            <form onSubmit={handleCreateZone}>
              <h3>Create Zone</h3>

              <input
                placeholder="Zone name"
                value={zoneForm.name}
                onChange={(e) =>
                  setZoneForm({
                    ...zoneForm,
                    name: e.target.value,
                  })
                }
                required
              />

              <input
                type="number"
                placeholder="Capacity"
                value={zoneForm.capacity}
                onChange={(e) =>
                  setZoneForm({
                    ...zoneForm,
                    capacity: e.target.value,
                  })
                }
                min="1"
                required
              />

              <button type="submit">Create Zone</button>
            </form>

            {/* CREATE CHECKPOINT */}

            <form onSubmit={handleCreateCheckpoint}>
              <h3>Create Checkpoint</h3>

              <input
                placeholder="Checkpoint name"
                value={checkpointForm.name}
                onChange={(e) =>
                  setCheckpointForm({
                    ...checkpointForm,
                    name: e.target.value,
                  })
                }
                required
              />

              <select
                value={checkpointForm.zone_id}
                onChange={(e) =>
                  setCheckpointForm({
                    ...checkpointForm,
                    zone_id: e.target.value,
                  })
                }
                required
              >
                <option value="">Select zone</option>

                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>

              <select
                value={checkpointForm.type}
                onChange={(e) =>
                  setCheckpointForm({
                    ...checkpointForm,
                    type: e.target.value,
                  })
                }
              >
                <option value="QR">QR</option>
                <option value="NFC">NFC</option>
                <option value="RFID">RFID</option>
                <option value="BARCODE">Barcode</option>
              </select>

              <select
                value={checkpointForm.direction}
                onChange={(e) =>
                  setCheckpointForm({
                    ...checkpointForm,
                    direction: e.target.value,
                  })
                }
              >
                <option value="ENTRY">ENTRY</option>
                <option value="EXIT">EXIT</option>
              </select>

              <button type="submit">
                Create Checkpoint
              </button>
            </form>

            {/* CREATE PARTICIPANT */}

            <form onSubmit={handleCreateParticipant}>
              <h3>Create Participant</h3>

              <input
                placeholder="Name"
                value={participantForm.name}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    name: e.target.value,
                  })
                }
                required
              />

              <input
                type="email"
                placeholder="Email"
                value={participantForm.email}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    email: e.target.value,
                  })
                }
              />

              <input
                placeholder="Participant token"
                value={participantForm.token}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    token: e.target.value,
                  })
                }
                required
              />

              <button type="submit">
                Add Participant
              </button>
            </form>
          </div>
        </section>

        {/* TRACKING */}

        <section>
          <h2>Tracking</h2>

          <form
            className="tracking-form"
            onSubmit={handleTracking}
          >
            <input
              placeholder="Scan / enter participant token"
              value={trackingForm.token}
              onChange={(e) =>
                setTrackingForm({
                  ...trackingForm,
                  token: e.target.value,
                })
              }
              required
            />

            <select
              value={trackingForm.checkpoint_id}
              onChange={(e) =>
                setTrackingForm({
                  ...trackingForm,
                  checkpoint_id: e.target.value,
                })
              }
              required
            >
              <option value="">Select checkpoint</option>

              {checkpoints.map((checkpoint) => (
                <option
                  key={checkpoint.id}
                  value={checkpoint.id}
                >
                  {checkpoint.name}
                </option>
              ))}
            </select>

            <select
              value={trackingForm.direction}
              onChange={(e) =>
                setTrackingForm({
                  ...trackingForm,
                  direction: e.target.value,
                })
              }
            >
              <option value="ENTRY">ENTRY</option>
              <option value="EXIT">EXIT</option>
            </select>

            <button type="submit">
              Record Tracking
            </button>
          </form>

          {mode === "DEMO" && (
            <div className="demo-controls">
              <h3>Simulation</h3>

              <button
                onClick={() => simulateTracking("NORMAL")}
              >
                Normal
              </button>

              <button
                onClick={() => simulateTracking("SURGE")}
              >
                Surge
              </button>

              <button
                onClick={() => simulateTracking("CLEARING")}
              >
                Clearing
              </button>
            </div>
          )}
        </section>

        {/* RECENT TRACKING EVENTS */}

        <section>
          <h2>Recent Tracking Events</h2>

          {recentEvents.length === 0 ? (
            <p>No tracking events recorded yet.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Zone</th>
                    <th>Checkpoint</th>
                    <th>Direction</th>
                    <th>Source</th>
                    <th>Time</th>
                  </tr>
                </thead>

                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        {event.participant_name || "Unknown"}
                      </td>

                      <td>
                        {event.zone_name || "Unknown"}
                      </td>

                      <td>
                        {event.checkpoint_name || "Unknown"}
                      </td>

                      <td>{event.direction}</td>

                      <td>{event.source}</td>

                      <td>
                        {event.timestamp
                          ? new Date(
                              event.timestamp
                            ).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default App;