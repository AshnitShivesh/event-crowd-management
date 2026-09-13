import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  getEvents,
  createEvent,
  deleteEvent,
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
  SOCKET_URL,
} from "./api";
import "./index.css";

const emptyEvent = {
  name: "",
  description: "",
  start_time: "",
  end_time: "",
};

const emptyZone = {
  name: "",
  capacity: "",
};

const emptyCheckpoint = {
  name: "",
  zone_id: "",
  type: "QR",
  direction: "ENTRY",
};

const emptyParticipant = {
  name: "",
  email: "",
  token: "",
};

const emptyTracking = {
  token: "",
  checkpoint_id: "",
  direction: "ENTRY",
};

function App() {
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const [selectedEvent, setSelectedEvent] = useState("");
  const [mode, setMode] = useState("LIVE");
  const [simMode, setSimMode] = useState("NORMAL");
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [eventForm, setEventForm] = useState(emptyEvent);
  const [zoneForm, setZoneForm] = useState(emptyZone);
  const [checkpointForm, setCheckpointForm] =
    useState(emptyCheckpoint);
  const [participantForm, setParticipantForm] =
    useState(emptyParticipant);
  const [trackingForm, setTrackingForm] =
    useState(emptyTracking);

  const simulationStart = useRef(Date.now());

  const notify = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);

    setTimeout(() => {
      setMessage("");
    }, 3500);
  };

  async function loadEventData(eventId) {
    if (!eventId) return;

    try {
      const [zonesData, dashboardData, analyticsData] =
        await Promise.all([
          getZones(eventId),
          getDashboard(eventId),
          getAnalytics(eventId),
        ]);

      setZones(zonesData);
      setDashboard(dashboardData);
      setAnalytics(analyticsData);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function loadLists() {
    const [
      eventsData,
      checkpointsData,
      participantsData,
      trackingData,
      alertsData,
    ] = await Promise.all([
      getEvents(),
      getCheckpoints(),
      getParticipants(),
      getTrackingEvents(),
      getAlerts(),
    ]);

    setEvents(eventsData);
    setCheckpoints(checkpointsData);
    setParticipants(participantsData);
    setTrackingEvents(trackingData);
    setAlerts(alertsData);

    if (eventsData.length && !selectedEvent) {
      setSelectedEvent(String(eventsData[0].id));
    }
  }

  useEffect(() => {
    setLoading(true);

    loadLists()
      .catch((error) => notify(error.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEvent) return;

    loadEventData(selectedEvent);
  }, [selectedEvent]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("tracking:update", async (result) => {
      const zoneId = Number(result?.zone?.id);
      if (!zoneId) return;

      const belongsToEvent =
        Number(result?.zone?.event_id) ===
        Number(selectedEvent);

      if (!belongsToEvent) return;

      setZones((previous) =>
        previous.map((zone) =>
          Number(zone.id) === zoneId
            ? { ...zone, ...result.zone }
            : zone
        )
      );

      try {
        const [dashboardData, analyticsData, trackingData, alertsData] =
          await Promise.all([
            getDashboard(selectedEvent),
            getAnalytics(selectedEvent),
            getTrackingEvents(),
            getAlerts(),
          ]);

        setDashboard(dashboardData);
        setAnalytics(analyticsData);
        setTrackingEvents(trackingData);
        setAlerts(alertsData);
      } catch (error) {
        console.error("Real-time refresh error:", error);
      }
    });

    return () => {
      socket.off("tracking:update");
      socket.disconnect();
    };
  }, [selectedEvent]);

  const eventZoneIds = useMemo(
    () => new Set(zones.map((zone) => Number(zone.id))),
    [zones]
  );

  const eventCheckpoints = useMemo(
    () =>
      checkpoints.filter((checkpoint) =>
        eventZoneIds.has(Number(checkpoint.zone_id))
      ),
    [checkpoints, eventZoneIds]
  );

  const eventTracking = useMemo(
    () =>
      trackingEvents.filter((event) =>
        eventZoneIds.has(Number(event.zone_id))
      ),
    [trackingEvents, eventZoneIds]
  );

  const eventAlerts = useMemo(
    () =>
      alerts.filter((alert) =>
        eventZoneIds.has(Number(alert.zone_id))
      ),
    [alerts, eventZoneIds]
  );

  const selectedEventObject = events.find(
    (event) =>
      Number(event.id) === Number(selectedEvent)
  );

  const totalCapacity =
    dashboard?.totalCapacity ??
    zones.reduce(
      (sum, zone) =>
        sum + Number(zone.capacity || 0),
      0
    );

  const totalOccupancy =
    dashboard?.totalOccupancy ??
    zones.reduce(
      (sum, zone) =>
        sum + Number(zone.current_occupancy || 0),
      0
    );

  const utilization =
    dashboard?.utilization ??
    (totalCapacity
      ? Math.round(
          (totalOccupancy / totalCapacity) * 100
        )
      : 0);

  const totalEntries =
    analytics?.totalEntries ??
    eventTracking.filter(
      (event) => event.direction === "ENTRY"
    ).length;

  const totalExits =
    analytics?.totalExits ??
    eventTracking.filter(
      (event) => event.direction === "EXIT"
    ).length;

  const recentEvents = eventTracking.slice(0, 5);

  const calculatedBusiestZone = useMemo(() => {
    const counts = {};

    eventTracking.forEach((event) => {
      const name = event.zone_name || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    });

    return (
      Object.entries(counts).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0] || "N/A"
    );
  }, [eventTracking]);

  const busiestZone =
    analytics?.busiestZone?.name || calculatedBusiestZone;

  async function refresh() {
    await Promise.all([
      loadEventData(selectedEvent),
      loadLists(),
    ]);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();

    try {
      const created = await createEvent(eventForm);

      setEventForm(emptyEvent);

      const updatedEvents = await getEvents();

      setEvents(updatedEvents);
      setSelectedEvent(String(created.id));

      await loadEventData(created.id);

      notify("Event created successfully.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateZone(e) {
    e.preventDefault();

    if (!selectedEvent) {
      notify("Select an event first.", "error");
      return;
    }

    if (!zoneForm.name || !zoneForm.capacity) {
      notify(
        "Enter a zone name and capacity.",
        "error"
      );
      return;
    }

    try {
      await createZone({
        ...zoneForm,
        event_id: Number(selectedEvent),
      });

      setZoneForm(emptyZone);

      await refresh();

      notify("Zone created successfully.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateCheckpoint(e) {
    e.preventDefault();

    if (!checkpointForm.zone_id) {
      notify("Select a zone first.", "error");
      return;
    }

    try {
      await createCheckpoint({
        ...checkpointForm,
        zone_id: Number(checkpointForm.zone_id),
      });

      setCheckpointForm(emptyCheckpoint);

      await refresh();

      notify("Checkpoint created successfully.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateParticipant(e) {
    e.preventDefault();

    const token =
      participantForm.token.trim() ||
      `EVT-${String(
        participants.length + 1
      ).padStart(3, "0")}`;

    try {
      await createParticipant({
        ...participantForm,
        token,
      });

      setParticipantForm(emptyParticipant);

      await loadLists();

      notify(
        `Participant added. Token: ${token}`
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleTracking(e) {
    e.preventDefault();

    if (!trackingForm.checkpoint_id) {
      notify("Select a checkpoint.", "error");
      return;
    }

    try {
      const result =
        await recordTrackingEvent({
          ...trackingForm,
          checkpoint_id: Number(
            trackingForm.checkpoint_id
          ),
          source:
            mode === "DEMO"
              ? "SIMULATOR"
              : "QR",
        });

      setTrackingForm((previous) => ({
        ...previous,
        token: "",
      }));

      notify(
        result.message ||
          "Tracking event recorded."
      );

      await refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEventObject) return;

    const confirmed = window.confirm(
      `Delete "${selectedEventObject.name}"?\n\nThis will remove its zones, checkpoints, tracking history and alerts.`
    );

    if (!confirmed) return;

    try {
      await deleteEvent(
        selectedEventObject.id
      );

      const remaining = events.filter(
        (event) =>
          Number(event.id) !==
          Number(selectedEventObject.id)
      );

      setEvents(remaining);
      setZones([]);
      setTrackingEvents([]);
      setAlerts([]);
      setDashboard(null);
      setAnalytics(null);

      if (remaining.length) {
        setSelectedEvent(
          String(remaining[0].id)
        );
      } else {
        setSelectedEvent("");
      }

      notify("Event deleted successfully.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  const simulationConfig = {
    NORMAL: {
      interval: 2500,
      batch: 1,
      entryChance: 0.65,
    },

    REDUCED: {
      interval: 5000,
      batch: 1,
      entryChance: 0.55,
    },

    BURST: {
      interval: 1000,
      batch: 4,
      entryChance: 0.9,
    },
  };

  async function runSimulationStep() {
    if (
      !eventCheckpoints.length ||
      !participants.length
    ) {
      return;
    }

    const config =
      simulationConfig[simMode];

    let batch = config.batch;
    let entryChance = config.entryChance;

    /*
     * REDUCED MODE:
     * The simulated event has a 60-second lifecycle.
     * Activity is lower during the first and last 15 seconds
     * and higher during the middle.
     */
    if (simMode === "REDUCED") {
      const elapsed =
        (Date.now() -
          simulationStart.current) %
        60000;

      const lowActivity =
        elapsed < 15000 ||
        elapsed >= 45000;

      batch = lowActivity ? 1 : 2;
      entryChance = lowActivity
        ? 0.45
        : 0.65;
    }

    for (let i = 0; i < batch; i++) {
      const checkpoint =
        eventCheckpoints[
          Math.floor(
            Math.random() *
              eventCheckpoints.length
          )
        ];

      const participant =
        participants[
          Math.floor(
            Math.random() *
              participants.length
          )
        ];

      const direction =
        Math.random() < entryChance
          ? "ENTRY"
          : "EXIT";

      try {
        await recordTrackingEvent({
          token: participant.token,
          checkpoint_id: Number(
            checkpoint.id
          ),
          direction,
          source: "SIMULATOR",
        });
      } catch (error) {
        console.error(
          "Simulation error:",
          error
        );
      }
    }

    await refresh();
  }

  useEffect(() => {
    if (
      mode !== "DEMO" ||
      !selectedEvent ||
      !eventCheckpoints.length ||
      !participants.length
    ) {
      setSimulationRunning(false);
      return;
    }

    simulationStart.current =
      Date.now();

    setSimulationRunning(true);

    const interval = setInterval(
      runSimulationStep,
      simulationConfig[simMode].interval
    );

    return () => {
      clearInterval(interval);
      setSimulationRunning(false);
    };
  }, [
    mode,
    simMode,
    selectedEvent,
    eventCheckpoints.length,
    participants.length,
  ]);

  function getZoneStatus(zone) {
    const value = zone.capacity
      ? Math.round(
          (zone.current_occupancy /
            zone.capacity) *
            100
        )
      : 0;

    if (value >= 100) return "CRITICAL";
    if (value >= 90) return "HIGH";
    if (value >= 70) return "WARNING";
    return "NORMAL";
  }

  return (
    <div className="app">

      {/* HEADER */}
      <header className="app-header">
        <div className="header-inner">

          <div className="brand">
            <div className="brand-mark">
              EC
            </div>

            <div>
              <h1>
                Event Crowd Management
              </h1>

              <p>
                Real-time crowd monitoring &
                decision support
              </p>
            </div>
          </div>

          <div className="mode-switch">
            <span className="mode-label">
              System Mode
            </span>

            <div className="mode-buttons">

              <button
                className={
                  mode === "LIVE"
                    ? "mode-btn active live"
                    : "mode-btn"
                }
                onClick={() =>
                  setMode("LIVE")
                }
              >
                <span className="mode-dot"></span>
                LIVE
              </button>

              <button
                className={
                  mode === "DEMO"
                    ? "mode-btn active demo"
                    : "mode-btn"
                }
                onClick={() =>
                  setMode("DEMO")
                }
              >
                DEMO
              </button>

            </div>

            {/* SIMULATION TOGGLES DIRECTLY UNDER DEMO */}
            {mode === "DEMO" && (
              <div className="simulation-mode-buttons">

                {[
                  "NORMAL",
                  "REDUCED",
                  "BURST",
                ].map((value) => (
                  <button
                    key={value}
                    className={
                      simMode === value
                        ? "simulation-mode active"
                        : "simulation-mode"
                    }
                    onClick={() =>
                      setSimMode(value)
                    }
                  >
                    {value}
                  </button>
                ))}

              </div>
            )}

          </div>
        </div>
      </header>

      <main>

        {/* MESSAGE */}
        {message && (
          <div
            className={`message ${messageType}`}
          >
            <span>{message}</span>

            <button
              onClick={() =>
                setMessage("")
              }
            >
              ×
            </button>
          </div>
        )}

        {/* EVENT HEADER */}
        <section className="hero-card">

          <div>
            <span className="eyebrow">
              EVENT DASHBOARD
            </span>

            <h2>
              {selectedEventObject?.name ||
                "Select an event"}
            </h2>

            <p>
              {selectedEventObject?.description ||
                "Choose an event to start monitoring crowd activity."}
            </p>
          </div>

          <div className="event-select-box">

            <label>
              Monitoring event
            </label>

            <select
              value={selectedEvent}
              onChange={(e) =>
                setSelectedEvent(
                  e.target.value
                )
              }
            >
              <option value="">
                Select an event
              </option>

              {events.map((event) => (
                <option
                  key={event.id}
                  value={event.id}
                >
                  {event.name}
                </option>
              ))}
            </select>

            {selectedEvent && (
              <button
                className="delete-event-btn"
                onClick={handleDeleteEvent}
              >
                Delete Event
              </button>
            )}

          </div>
        </section>

        {loading ? (

          <section className="loading-card">
            <div className="spinner"></div>
            <p>
              Loading event data...
            </p>
          </section>

        ) : (

          <>

            {/* OVERVIEW */}
            {selectedEvent && (
              <section>

                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      LIVE OVERVIEW
                    </span>

                    <h2>
                      Crowd Status
                    </h2>
                  </div>

                  <div className="live-indicator">
                    <span></span>
                    Monitoring
                  </div>
                </div>

                <div className="stats-grid">

                  <div className="stat-card blue">
                    <div className="stat-top">
                      <span>
                        Total Capacity
                      </span>

                      <div className="stat-icon">
                        CAP
                      </div>
                    </div>

                    <strong>
                      {totalCapacity.toLocaleString()}
                    </strong>

                    <p>
                      Across all monitored zones
                    </p>
                  </div>

                  <div className="stat-card purple">
                    <div className="stat-top">
                      <span>
                        Current Occupancy
                      </span>

                      <div className="stat-icon">
                        OCC
                      </div>
                    </div>

                    <strong>
                      {totalOccupancy.toLocaleString()}
                    </strong>

                    <p>
                      People currently inside
                    </p>
                  </div>

                  <div className="stat-card orange">
                    <div className="stat-top">
                      <span>
                        Utilization
                      </span>

                      <div className="stat-icon">
                        %
                      </div>
                    </div>

                    <strong>
                      {utilization}%
                    </strong>

                    <div className="mini-progress">
                      <div
                        style={{
                          width: `${Math.min(
                            utilization,
                            100
                          )}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="stat-card red">
                    <div className="stat-top">
                      <span>
                        Active Alerts
                      </span>

                      <div className="stat-icon">
                        !
                      </div>
                    </div>

                    <strong>
                      {eventAlerts.length}
                    </strong>

                    <p>
                      {eventAlerts.length
                        ? "Zones require attention"
                        : "All zones normal"}
                    </p>
                  </div>

                </div>
              </section>
            )}

            {/* ZONES */}
            {selectedEvent && (
              <section>

                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      MONITORED AREAS
                    </span>

                    <h2>
                      Zone Overview
                    </h2>
                  </div>

                  <span className="section-count">
                    {zones.length} zones
                  </span>
                </div>

                {zones.length ? (

                  <div className="zone-grid">

                    {zones.map((zone) => {
                      const zoneUtilization =
                        zone.capacity
                          ? Math.round(
                              (zone.current_occupancy /
                                zone.capacity) *
                                100
                            )
                          : 0;

                      const status =
                        getZoneStatus(zone);

                      return (
                        <div
                          className="zone-card"
                          key={zone.id}
                        >

                          <div className="zone-card-top">
                            <div>
                              <h3>
                                {zone.name}
                              </h3>

                              <span>
                                Zone capacity{" "}
                                {zone.capacity}
                              </span>
                            </div>

                            <span
                              className={`status-badge ${status.toLowerCase()}`}
                            >
                              {status}
                            </span>
                          </div>

                          <div className="zone-number">
                            <strong>
                              {zone.current_occupancy}
                            </strong>

                            <span>
                              / {zone.capacity} people
                            </span>
                          </div>

                          <div className="zone-progress">
                            <div
                              className={`zone-progress-fill ${status.toLowerCase()}`}
                              style={{
                                width: `${Math.min(
                                  zoneUtilization,
                                  100
                                )}%`,
                              }}
                            ></div>
                          </div>

                          <div className="zone-footer">
                            <span>
                              Utilization
                            </span>

                            <strong>
                              {zoneUtilization}%
                            </strong>
                          </div>

                        </div>
                      );
                    })}

                  </div>

                ) : (

                  <div className="empty-state">
                    <div className="empty-icon">
                      +
                    </div>

                    <h3>
                      No zones configured
                    </h3>

                    <p>
                      Create a zone below to begin
                      monitoring.
                    </p>
                  </div>

                )}

              </section>
            )}

            {/* ANALYTICS */}
            {selectedEvent && (
              <section>

                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      EVENT ANALYTICS
                    </span>

                    <h2>
                      Movement Insights
                    </h2>
                  </div>
                </div>

                <div className="analytics-grid">

                  <div className="analytics-card">
                    <span>
                      Total Entries
                    </span>

                    <strong>
                      {totalEntries}
                    </strong>

                    <small>
                      Recorded movement in
                    </small>
                  </div>

                  <div className="analytics-card">
                    <span>
                      Total Exits
                    </span>

                    <strong>
                      {totalExits}
                    </strong>

                    <small>
                      Recorded movement out
                    </small>
                  </div>

                  <div className="analytics-card">
                    <span>
                      Tracking Events
                    </span>

                    <strong>
                      {eventTracking.length}
                    </strong>

                    <small>
                      Total movement records
                    </small>
                  </div>

                  <div className="analytics-card">
                    <span>
                      Busiest Zone
                    </span>

                    <strong className="busiest">
                      {busiestZone}
                    </strong>

                    <small>
                      Based on tracking activity
                    </small>
                  </div>

                </div>
              </section>
            )}

            {/* ALERTS */}
            {selectedEvent && (
              <section>

                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      DECISION SUPPORT
                    </span>

                    <h2>
                      Active Alerts
                    </h2>
                  </div>

                  <span className="alert-count">
                    {eventAlerts.length} active
                  </span>
                </div>

                {eventAlerts.length ? (

                  <div className="alerts-list">
                    {eventAlerts.map(
                      (alert) => (
                        <div
                          key={alert.id}
                          className={`alert-item ${String(
                            alert.type
                          ).toLowerCase()}`}
                        >

                          <div className="alert-symbol">
                            !
                          </div>

                          <div>
                            <strong>
                              {alert.type} —{" "}
                              {alert.zone_name}
                            </strong>

                            <p>
                              {alert.message}
                            </p>
                          </div>

                        </div>
                      )
                    )}
                  </div>

                ) : (

                  <div className="no-alerts">

                    <div className="check-icon">
                      ✓
                    </div>

                    <div>
                      <strong>
                        All zones are operating
                        normally
                      </strong>

                      <p>
                        No crowd conditions
                        currently require
                        attention.
                      </p>
                    </div>

                  </div>
                )}

              </section>
            )}

            {/* EVENT SETUP */}
            <section>

              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    CONFIGURATION
                  </span>

                  <h2>
                    Event Setup
                  </h2>
                </div>
              </div>

              <div className="form-grid">

                {/* EVENT */}
                <SetupCard
                  number="01"
                  color="blue-bg"
                  title="Create Event"
                  text="Set up a new event to monitor."
                >
                  <form
                    onSubmit={handleCreateEvent}
                  >

                    <label>
                      Event name
                    </label>

                    <input
                      placeholder="e.g. TechFest 2026"
                      value={eventForm.name}
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          name: e.target.value,
                        })
                      }
                      required
                    />

                    <label>
                      Description
                    </label>

                    <textarea
                      placeholder="Brief description of the event"
                      value={
                        eventForm.description
                      }
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          description:
                            e.target.value,
                        })
                      }
                    />

                    <div className="two-inputs">

                      <div>
                        <label>
                          Start time
                        </label>

                        <input
                          type="datetime-local"
                          value={
                            eventForm.start_time
                          }
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              start_time:
                                e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label>
                          End time
                        </label>

                        <input
                          type="datetime-local"
                          value={
                            eventForm.end_time
                          }
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              end_time:
                                e.target.value,
                            })
                          }
                        />
                      </div>

                    </div>

                    <button className="primary-btn">
                      Create Event
                    </button>

                  </form>
                </SetupCard>

                {/* ZONE */}
                <SetupCard
                  number="02"
                  color="purple-bg"
                  title="Create Zone"
                  text="Define an area and its capacity."
                >
                  <form
                    onSubmit={handleCreateZone}
                  >

                    <label>
                      Zone name
                    </label>

                    <input
                      placeholder="e.g. Main Hall"
                      value={zoneForm.name}
                      onChange={(e) =>
                        setZoneForm({
                          ...zoneForm,
                          name: e.target.value,
                        })
                      }
                      required
                    />

                    <label>
                      Capacity
                    </label>

                    <input
                      type="number"
                      min="1"
                      placeholder="Maximum people"
                      value={zoneForm.capacity}
                      onChange={(e) =>
                        setZoneForm({
                          ...zoneForm,
                          capacity:
                            e.target.value,
                        })
                      }
                      required
                    />

                    <button className="primary-btn">
                      Create Zone
                    </button>

                  </form>
                </SetupCard>

                {/* CHECKPOINT */}
                <SetupCard
                  number="03"
                  color="orange-bg"
                  title="Create Checkpoint"
                  text="Configure a detection point."
                >
                  <form
                    onSubmit={
                      handleCreateCheckpoint
                    }
                  >

                    <label>
                      Checkpoint name
                    </label>

                    <input
                      placeholder="e.g. Main Entrance"
                      value={
                        checkpointForm.name
                      }
                      onChange={(e) =>
                        setCheckpointForm({
                          ...checkpointForm,
                          name: e.target.value,
                        })
                      }
                      required
                    />

                    <label>
                      Assigned zone
                    </label>

                    <select
                      value={
                        checkpointForm.zone_id
                      }
                      onChange={(e) =>
                        setCheckpointForm({
                          ...checkpointForm,
                          zone_id:
                            e.target.value,
                        })
                      }
                      required
                    >
                      <option value="">
                        Select zone
                      </option>

                      {zones.map((zone) => (
                        <option
                          key={zone.id}
                          value={zone.id}
                        >
                          {zone.name}
                        </option>
                      ))}
                    </select>

                    <div className="two-inputs">

                      <div>
                        <label>
                          Method
                        </label>

                        <select
                          value={
                            checkpointForm.type
                          }
                          onChange={(e) =>
                            setCheckpointForm({
                              ...checkpointForm,
                              type: e.target.value,
                            })
                          }
                        >
                          <option>
                            QR
                          </option>

                          <option>
                            NFC
                          </option>

                          <option>
                            RFID
                          </option>

                          <option>
                            BARCODE
                          </option>
                        </select>
                      </div>

                      <div>
                        <label>
                          Direction
                        </label>

                        <select
                          value={
                            checkpointForm.direction
                          }
                          onChange={(e) =>
                            setCheckpointForm({
                              ...checkpointForm,
                              direction:
                                e.target.value,
                            })
                          }
                        >
                          <option>
                            ENTRY
                          </option>

                          <option>
                            EXIT
                          </option>
                        </select>
                      </div>

                    </div>

                    <button className="primary-btn">
                      Create Checkpoint
                    </button>

                  </form>
                </SetupCard>

                {/* PARTICIPANT */}
                <SetupCard
                  number="04"
                  color="green-bg"
                  title="Create Participant"
                  text="Register a participant for tracking."
                >
                  <form
                    onSubmit={
                      handleCreateParticipant
                    }
                  >

                    <label>
                      Name
                    </label>

                    <input
                      placeholder="Participant name"
                      value={
                        participantForm.name
                      }
                      onChange={(e) =>
                        setParticipantForm({
                          ...participantForm,
                          name: e.target.value,
                        })
                      }
                      required
                    />

                    <label>
                      Email
                    </label>

                    <input
                      type="email"
                      placeholder="participant@email.com"
                      value={
                        participantForm.email
                      }
                      onChange={(e) =>
                        setParticipantForm({
                          ...participantForm,
                          email:
                            e.target.value,
                        })
                      }
                    />

                    <label>
                      Participant token
                    </label>

                    <input
                      placeholder="Leave blank to generate automatically"
                      value={
                        participantForm.token
                      }
                      onChange={(e) =>
                        setParticipantForm({
                          ...participantForm,
                          token:
                            e.target.value,
                        })
                      }
                    />

                    <button className="primary-btn">
                      Add Participant
                    </button>

                  </form>
                </SetupCard>

              </div>
            </section>

            {/* TRACKING */}
            <section className="tracking-section">

              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    MOVEMENT TRACKING
                  </span>

                  <h2>
                    Record Activity
                  </h2>
                </div>

                {mode === "DEMO" && (
                  <span className="demo-badge">
                    DEMO MODE
                  </span>
                )}
              </div>

              <form
                className="tracking-form"
                onSubmit={handleTracking}
              >

                <div className="tracking-field large">
                  <label>
                    Participant token
                  </label>

                  <input
                    placeholder="Scan or enter participant token"
                    value={
                      trackingForm.token
                    }
                    onChange={(e) =>
                      setTrackingForm({
                        ...trackingForm,
                        token: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="tracking-field">
                  <label>
                    Checkpoint
                  </label>

                  <select
                    value={
                      trackingForm.checkpoint_id
                    }
                    onChange={(e) =>
                      setTrackingForm({
                        ...trackingForm,
                        checkpoint_id:
                          e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">
                      Select checkpoint
                    </option>

                    {eventCheckpoints.map(
                      (checkpoint) => (
                        <option
                          key={checkpoint.id}
                          value={checkpoint.id}
                        >
                          {checkpoint.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="tracking-field small">
                  <label>
                    Direction
                  </label>

                  <select
                    value={
                      trackingForm.direction
                    }
                    onChange={(e) =>
                      setTrackingForm({
                        ...trackingForm,
                        direction:
                          e.target.value,
                      })
                    }
                  >
                    <option>
                      ENTRY
                    </option>

                    <option>
                      EXIT
                    </option>
                  </select>
                </div>

                <button className="tracking-btn">
                  Record Tracking
                </button>

              </form>

              {/* DEMO STATUS */}
              {mode === "DEMO" && (
                <div className="demo-panel">

                  <div>
                    <span className="eyebrow">
                      LIVE SIMULATION
                    </span>

                    <h3>
                      {simMode} MODE
                    </h3>

                    <p>
                      {simMode === "BURST"
                        ? "Heavy crowd flow with rapid entries."
                        : simMode === "REDUCED"
                        ? "Lower activity at the simulated start and end, with more movement in the middle."
                        : "Expected crowd movement through the event."}
                    </p>
                  </div>

                  <div className="simulation-status">

                    <span
                      className={
                        simulationRunning
                          ? "simulation-dot active"
                          : "simulation-dot"
                      }
                    ></span>

                    <div>
                      <strong>
                        {simulationRunning
                          ? "SIMULATION ACTIVE"
                          : "SIMULATION PAUSED"}
                      </strong>

                      <span>
                        {simulationRunning
                          ? "Automatic movement is running"
                          : "Add a participant and checkpoint to begin"}
                      </span>
                    </div>

                  </div>

                </div>
              )}

            </section>

            {/* RECENT EVENTS */}
            <section>

              <div className="section-heading">

                <div>
                  <span className="eyebrow">
                    ACTIVITY LOG
                  </span>

                  <h2>
                    Recent Tracking Events
                  </h2>
                </div>

                <span className="section-count">
                  Latest 5
                </span>

              </div>

              {recentEvents.length ? (

                <div className="table-container">

                  <table>

                    <thead>
                      <tr>
                        <th>
                          Participant
                        </th>

                        <th>
                          Zone
                        </th>

                        <th>
                          Checkpoint
                        </th>

                        <th>
                          Direction
                        </th>

                        <th>
                          Source
                        </th>

                        <th>
                          Time
                        </th>
                      </tr>
                    </thead>

                    <tbody>

                      {recentEvents.map(
                        (event) => (
                          <tr key={event.id}>

                            <td>
                              <strong>
                                {event.participant_name ||
                                  "Unknown"}
                              </strong>
                            </td>

                            <td>
                              {event.zone_name ||
                                "Unknown"}
                            </td>

                            <td>
                              {event.checkpoint_name ||
                                "Unknown"}
                            </td>

                            <td>
                              <span
                                className={`direction-badge ${String(
                                  event.direction
                                ).toLowerCase()}`}
                              >
                                {event.direction}
                              </span>
                            </td>

                            <td>
                              <span className="source-badge">
                                {event.source}
                              </span>
                            </td>

                            <td>
                              {event.timestamp
                                ? new Date(
                                    event.timestamp
                                  ).toLocaleString()
                                : "-"}
                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>

              ) : (

                <div className="empty-state compact">
                  <h3>
                    No tracking activity yet
                  </h3>

                  <p>
                    Recorded movement will
                    appear here.
                  </p>
                </div>

              )}

            </section>

          </>
        )}
      </main>

      <footer>
        <span>
          Event Crowd Management System
        </span>

        <span>
          Real-time monitoring • Decision support
        </span>
      </footer>

    </div>
  );
}

function SetupCard({
  number,
  color,
  title,
  text,
  children,
}) {
  return (
    <div className="setup-card">

      <div className="form-title">

        <div className={`form-icon ${color}`}>
          {number}
        </div>

        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>

      </div>

      {children}

    </div>
  );
}

export default App;ss