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
  status: "UPCOMING",
};

const emptyZone = {
  event_id: "",
  name: "",
  capacity: "",
};

const emptyCheckpoint = {
  zone_id: "",
  name: "",
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
  source: "QR",
};

function getZoneStatus(zone) {
  const capacity = Number(zone.capacity || 0);
  const occupancy = Number(zone.current_occupancy || 0);

  if (!capacity) return "NORMAL";

  const percentage = (occupancy / capacity) * 100;

  if (percentage >= 100) return "CRITICAL";
  if (percentage >= 90) return "HIGH";
  if (percentage >= 70) return "WARNING";

  return "NORMAL";
}

function SetupCard({ number, color, title, text, children }) {
  return (
    <div className="setup-card">
      <div className={`setup-number ${color}`}>{number}</div>

      <div className="setup-content">
        <div className="setup-title">
          <h3>{title}</h3>
          <p>{text}</p>
        </div>

        {children}
      </div>
    </div>
  );
}

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
    if (!selectedEvent) {
      setZones([]);
      setDashboard(null);
      setAnalytics(null);
      return;
    }

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
        const [
          dashboardData,
          analyticsData,
          trackingData,
          alertsData,
        ] = await Promise.all([
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
        console.error(
          "Real-time dashboard refresh error:",
          error
        );
      }
    });

    return () => {
      socket.off("tracking:update");
      socket.disconnect();
    };
  }, [selectedEvent]);

  const eventZoneIds = useMemo(
    () =>
      new Set(
        zones.map((zone) => Number(zone.id))
      ),
    [zones]
  );

  const eventCheckpoints = useMemo(
    () =>
      checkpoints.filter((checkpoint) =>
        eventZoneIds.has(
          Number(checkpoint.zone_id)
        )
      ),
    [checkpoints, eventZoneIds]
  );

  const eventTracking = useMemo(
    () =>
      trackingEvents.filter((event) =>
        eventZoneIds.has(
          Number(event.zone_id)
        )
      ),
    [trackingEvents, eventZoneIds]
  );

  const eventAlerts = useMemo(
    () =>
      alerts.filter((alert) =>
        eventZoneIds.has(
          Number(alert.zone_id)
        )
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
        sum +
        Number(
          zone.current_occupancy || 0
        ),
      0
    );

  const utilization =
    dashboard?.utilization ??
    (totalCapacity
      ? Math.round(
          (totalOccupancy / totalCapacity) *
            100
        )
      : 0);

  const totalEntries =
    analytics?.totalEntries ??
    eventTracking.filter(
      (event) =>
        event.direction === "ENTRY"
    ).length;

  const totalExits =
    analytics?.totalExits ??
    eventTracking.filter(
      (event) =>
        event.direction === "EXIT"
    ).length;

  const recentEvents =
    eventTracking.slice(0, 5);

  const calculatedBusiestZone =
    useMemo(() => {
      const counts = {};

      eventTracking.forEach((event) => {
        const name =
          event.zone_name || "Unknown";

        counts[name] =
          (counts[name] || 0) + 1;
      });

      return (
        Object.entries(counts).sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || "N/A"
      );
    }, [eventTracking]);

  const busiestZone =
    analytics?.busiestZone?.name ||
    calculatedBusiestZone;

  async function refresh() {
    await Promise.all([
      loadEventData(selectedEvent),
      loadLists(),
    ]);
  }

  async function handleCreateEvent(e) {
    e.preventDefault();

    try {
      const created =
        await createEvent(eventForm);

      setEventForm(emptyEvent);

      const updatedEvents =
        await getEvents();

      setEvents(updatedEvents);
      setSelectedEvent(
        String(created.id)
      );

      await loadEventData(created.id);

      notify(
        "Event created successfully."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateZone(e) {
    e.preventDefault();

    if (!selectedEvent) {
      notify(
        "Select an event first.",
        "error"
      );
      return;
    }

    try {
      await createZone({
        ...zoneForm,
        event_id: Number(selectedEvent),
        capacity: Number(zoneForm.capacity),
      });

      setZoneForm({
        ...emptyZone,
        event_id: selectedEvent,
      });

      await loadEventData(selectedEvent);

      notify(
        "Zone created successfully."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateCheckpoint(e) {
    e.preventDefault();

    if (!selectedEvent) {
      notify(
        "Select an event first.",
        "error"
      );
      return;
    }

    if (!checkpointForm.zone_id) {
      notify(
        "Select a zone first.",
        "error"
      );
      return;
    }

    try {
      await createCheckpoint({
        ...checkpointForm,
        zone_id: Number(
          checkpointForm.zone_id
        ),
      });

      setCheckpointForm(
        emptyCheckpoint
      );

      await loadLists();

      notify(
        "Checkpoint created successfully."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleCreateParticipant(e) {
    e.preventDefault();

    try {
      await createParticipant(
        participantForm
      );

      setParticipantForm(
        emptyParticipant
      );

      await loadLists();

      notify(
        "Participant created successfully."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleTracking(e) {
    e.preventDefault();

    if (!selectedEvent) {
      notify(
        "Select an event first.",
        "error"
      );
      return;
    }

    try {
      await recordTrackingEvent({
        participantToken:
          trackingForm.token,
        checkpointId: Number(
          trackingForm.checkpoint_id
        ),
        direction:
          trackingForm.direction,
        source:
          trackingForm.source || "QR",
      });

      setTrackingForm({
        ...emptyTracking,
        direction:
          trackingForm.direction,
        source:
          trackingForm.source,
      });

      await refresh();

      notify(
        "Tracking event recorded."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) return;

    const eventName =
      selectedEventObject?.name ||
      "this event";

    const confirmed = window.confirm(
      `Delete ${eventName}? This will also remove its zones and related records.`
    );

    if (!confirmed) return;

    try {
      await deleteEvent(
        Number(selectedEvent)
      );

      const updatedEvents =
        await getEvents();

      setEvents(updatedEvents);

      if (updatedEvents.length) {
        setSelectedEvent(
          String(updatedEvents[0].id)
        );
      } else {
        setSelectedEvent("");
        setZones([]);
        setDashboard(null);
        setAnalytics(null);
      }

      await loadLists();

      notify(
        "Event deleted successfully."
      );
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    if (
      mode !== "DEMO" ||
      !selectedEvent ||
      !simulationRunning
    ) {
      return;
    }

    const interval = setInterval(async () => {
      const eventZones =
        zones.filter(
          (zone) =>
            Number(zone.event_id) ===
            Number(selectedEvent)
        );

      const eventCheckpointsForSimulation =
        checkpoints.filter((checkpoint) =>
          eventZoneIds.has(
            Number(checkpoint.zone_id)
          )
        );

      if (
        !eventZones.length ||
        !eventCheckpointsForSimulation.length ||
        !participants.length
      ) {
        return;
      }

      const elapsed =
        Date.now() -
        simulationStart.current;

      const seconds =
        elapsed / 1000;

      let selectedZone;

      if (
        simMode === "BURST"
      ) {
        selectedZone =
          eventZones[
            Math.floor(
              Math.random() *
                eventZones.length
            )
          ];
      } else if (
        simMode === "REDUCED"
      ) {
        selectedZone =
          eventZones[
            Math.floor(
              (seconds / 4) %
                eventZones.length
            )
          ];
      } else {
        selectedZone =
          eventZones[
            Math.floor(
              Math.random() *
                eventZones.length
            )
          ];
      }

      const zoneCheckpoints =
        eventCheckpointsForSimulation.filter(
          (checkpoint) =>
            Number(
              checkpoint.zone_id
            ) ===
            Number(selectedZone.id)
        );

      if (!zoneCheckpoints.length)
        return;

      const participant =
        participants[
          Math.floor(
            Math.random() *
              participants.length
          )
        ];

      let direction = "ENTRY";

      const occupancy =
        Number(
          selectedZone.current_occupancy ||
            0
        );

      const capacity =
        Number(
          selectedZone.capacity ||
            0
        );

      if (
        simMode === "REDUCED"
      ) {
        direction =
          Math.random() > 0.55
            ? "ENTRY"
            : "EXIT";
      } else if (
        occupancy >= capacity
      ) {
        direction = "EXIT";
      } else if (
        occupancy <= 0
      ) {
        direction = "ENTRY";
      } else {
        direction =
          Math.random() > 0.35
            ? "ENTRY"
            : "EXIT";
      }

      const matchingCheckpoints =
        zoneCheckpoints.filter(
          (checkpoint) =>
            checkpoint.direction ===
            direction
        );

      const checkpoint =
        matchingCheckpoints.length
          ? matchingCheckpoints[
              Math.floor(
                Math.random() *
                  matchingCheckpoints.length
              )
            ]
          : zoneCheckpoints[0];

      try {
        await recordTrackingEvent({
          participantToken:
            participant.token,
          checkpointId:
            Number(checkpoint.id),
          direction,
          source: "SIMULATION",
        });
      } catch (error) {
        console.error(
          "Simulation tracking error:",
          error
        );
      }
    }, simMode === "BURST" ? 700 : 1500);

    return () =>
      clearInterval(interval);
  }, [
    mode,
    selectedEvent,
    simulationRunning,
    simMode,
    zones,
    checkpoints,
    participants,
    eventZoneIds,
  ]);

  function startSimulation() {
    if (!selectedEvent) {
      notify(
        "Select an event first.",
        "error"
      );
      return;
    }

    if (!zones.length) {
      notify(
        "Create at least one zone first.",
        "error"
      );
      return;
    }

    if (!eventCheckpoints.length) {
      notify(
        "Create at least one checkpoint first.",
        "error"
      );
      return;
    }

    if (!participants.length) {
      notify(
        "Create at least one participant first.",
        "error"
      );
      return;
    }

    simulationStart.current =
      Date.now();

    setSimulationRunning(true);

    notify(
      `${simMode} simulation started.`
    );
  }

  function stopSimulation() {
    setSimulationRunning(false);

    notify(
      "Simulation paused."
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">
              ECM
            </div>

            <div>
              <strong>
                Event Crowd Management
              </strong>

              <span>
                Cloud Monitoring System
              </span>
            </div>
          </div>

          <div className="mode-switch">
            <button
              className={
                mode === "LIVE"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setMode("LIVE");
                setSimulationRunning(
                  false
                );
              }}
            >
              LIVE
            </button>

            <button
              className={
                mode === "DEMO"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMode("DEMO")
              }
            >
              DEMO
            </button>

            {mode === "DEMO" && (
              <div className="sim-modes">
                {[
                  "NORMAL",
                  "BURST",
                  "REDUCED",
                ].map((value) => (
                  <button
                    key={value}
                    className={
                      simMode === value
                        ? "active"
                        : ""
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
                onClick={
                  handleDeleteEvent
                }
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
                      Across all monitored
                      zones
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
                      People currently
                      inside
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
                              (Number(
                                zone.current_occupancy ||
                                  0
                              ) /
                                Number(
                                  zone.capacity
                                )) *
                                100
                            )
                          : 0;

                      const status =
                        getZoneStatus(
                          zone
                        );

                      return (
                        <div
                          className={`zone-card ${status.toLowerCase()}`}
                          key={zone.id}
                        >
                          <div className="zone-card-top">
                            <div>
                              <span className="zone-label">
                                ZONE
                              </span>

                              <h3>
                                {zone.name}
                              </h3>
                            </div>

                            <span
                              className={`zone-status ${status.toLowerCase()}`}
                            >
                              {status}
                            </span>
                          </div>

                          <div className="zone-numbers">
                            <div>
                              <strong>
                                {Number(
                                  zone.current_occupancy ||
                                    0
                                ).toLocaleString()}
                              </strong>

                              <span>
                                Current
                              </span>
                            </div>

                            <div className="zone-divider">
                              /
                            </div>

                            <div>
                              <strong>
                                {Number(
                                  zone.capacity ||
                                    0
                                ).toLocaleString()}
                              </strong>

                              <span>
                                Capacity
                              </span>
                            </div>
                          </div>

                          <div className="zone-progress">
                            <div
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
                              {zoneUtilization}%
                              utilized
                            </span>

                            <span>
                              {Math.max(
                                Number(
                                  zone.capacity ||
                                    0
                                ) -
                                  Number(
                                    zone.current_occupancy ||
                                      0
                                  ),
                                0
                              )}{" "}
                              spaces
                              available
                            </span>
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
                      Create a zone below
                      to begin monitoring.
                    </p>
                  </div>
                )}
              </section>
            )}

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
                      Based on tracking
                      activity
                    </small>
                  </div>
                </div>
              </section>
            )}

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
                        All zones are
                        operating normally
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
                <SetupCard
                  number="01"
                  color="blue-bg"
                  title="Create Event"
                  text="Set up a new event to monitor."
                >
                  <form
                    onSubmit={
                      handleCreateEvent
                    }
                  >
                    <label>
                      Event name
                    </label>

                    <input
                      placeholder="e.g. TechFest 2026"
                      value={
                        eventForm.name
                      }
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

                    <label>
                      Status
                    </label>

                    <select
                      value={
                        eventForm.status
                      }
                      onChange={(e) =>
                        setEventForm({
                          ...eventForm,
                          status:
                            e.target.value,
                        })
                      }
                    >
                      <option>
                        UPCOMING
                      </option>

                      <option>
                        ACTIVE
                      </option>

                      <option>
                        COMPLETED
                      </option>
                    </select>

                    <button className="primary-btn">
                      Create Event
                    </button>
                  </form>
                </SetupCard>

                <SetupCard
                  number="02"
                  color="purple-bg"
                  title="Create Zone"
                  text="Add a monitored area and capacity."
                >
                  <form
                    onSubmit={
                      handleCreateZone
                    }
                  >
                    <label>
                      Zone name
                    </label>

                    <input
                      placeholder="e.g. Main Hall"
                      value={
                        zoneForm.name
                      }
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
                      placeholder="e.g. 500"
                      value={
                        zoneForm.capacity
                      }
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

                <SetupCard
                  number="03"
                  color="orange-bg"
                  title="Create Checkpoint"
                  text="Configure an entry or exit point."
                >
                  <form
                    onSubmit={
                      handleCreateCheckpoint
                    }
                  >
                    <label>
                      Zone
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

                      {zones.map(
                        (zone) => (
                          <option
                            key={zone.id}
                            value={zone.id}
                          >
                            {zone.name}
                          </option>
                        )
                      )}
                    </select>

                    <label>
                      Checkpoint name
                    </label>

                    <input
                      placeholder="e.g. Main Gate"
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

                    <div className="two-inputs">
                      <div>
                        <label>
                          Type
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
                            MANUAL
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

                <SetupCard
                  number="04"
                  color="green-bg"
                  title="Create Participant"
                  text="Register a participant token."
                >
                  <form
                    onSubmit={
                      handleCreateParticipant
                    }
                  >
                    <label>
                      Participant name
                    </label>

                    <input
                      placeholder="e.g. Rahul Kumar"
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
                          email: e.target.value,
                        })
                      }
                    />

                    <label>
                      Token
                    </label>

                    <input
                      placeholder="e.g. EVT-001"
                      value={
                        participantForm.token
                      }
                      onChange={(e) =>
                        setParticipantForm({
                          ...participantForm,
                          token: e.target.value,
                        })
                      }
                      required
                    />

                    <button className="primary-btn">
                      Create Participant
                    </button>
                  </form>
                </SetupCard>
              </div>
            </section>

            {selectedEvent && (
              <section>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      TRACKING
                    </span>

                    <h2>
                      Record Movement
                    </h2>
                  </div>
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
                            value={
                              checkpoint.id
                            }
                          >
                            {
                              checkpoint.name
                            }
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
                        {simMode ===
                        "BURST"
                          ? "Heavy crowd flow with rapid entries."
                          : simMode ===
                            "REDUCED"
                          ? "Lower activity at the simulated start and end, with more movement in the middle."
                          : "Expected crowd movement through the event."}
                      </p>
                    </div>

                    <div className="simulation-controls">
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
                              : "Ready to start"}
                          </span>
                        </div>
                      </div>

                      {simulationRunning ? (
                        <button
                          className="simulation-btn stop"
                          onClick={
                            stopSimulation
                          }
                        >
                          Stop Simulation
                        </button>
                      ) : (
                        <button
                          className="simulation-btn"
                          onClick={
                            startSimulation
                          }
                        >
                          Start Simulation
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedEvent && (
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
                    {eventTracking.length}{" "}
                    records
                  </span>
                </div>

                {recentEvents.length ? (
                  <div className="activity-table">
                    <div className="activity-row activity-head">
                      <span>
                        Participant
                      </span>

                      <span>
                        Zone
                      </span>

                      <span>
                        Checkpoint
                      </span>

                      <span>
                        Direction
                      </span>

                      <span>
                        Source
                      </span>

                      <span>
                        Time
                      </span>
                    </div>

                    {recentEvents.map(
                      (event) => (
                        <div
                          className="activity-row"
                          key={event.id}
                        >
                          <span>
                            {
                              event.participant_name ||
                              "Unknown"
                            }
                          </span>

                          <span>
                            {
                              event.zone_name ||
                              "Unknown"
                            }
                          </span>

                          <span>
                            {
                              event.checkpoint_name ||
                              "Unknown"
                            }
                          </span>

                          <span>
                            <span
                              className={`direction-badge ${String(
                                event.direction
                              ).toLowerCase()}`}
                            >
                              {
                                event.direction
                              }
                            </span>
                          </span>

                          <span>
                            {
                              event.source ||
                              "QR"
                            }
                          </span>

                          <span>
                            {event.timestamp
                              ? new Date(
                                  event.timestamp
                                ).toLocaleTimeString()
                              : "—"}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      —
                    </div>

                    <h3>
                      No tracking events
                    </h3>

                    <p>
                      Movement records will
                      appear here in real time.
                    </p>
                  </div>
                )}
              </section>
            )}

            <section className="system-footer">
              <div>
                <span className="eyebrow">
                  CLOUD INFRASTRUCTURE
                </span>

                <h2>
                  Event Crowd Management
                </h2>

                <p>
                  Real-time event monitoring
                  powered by REST APIs,
                  PostgreSQL and Socket.IO.
                </p>
              </div>

              <div className="footer-actions">
                <button
                  className="secondary-btn"
                  onClick={refresh}
                  disabled={!selectedEvent}
                >
                  Refresh Dashboard
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
