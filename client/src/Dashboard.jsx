import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  getEvents,
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
  TOKEN_KEY,
} from "./api";
import "./index.css";
import RadialGauge from "./components/RadialGauge";
import { getStatusMeta } from "./components/densityMeta";
import SkeletonLoader from "./components/SkeletonLoader";
import VenueFloorPlan from "./components/VenueFloorPlan";
import RoleScannerTerminal from "./components/RoleScannerTerminal";

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

const SIMULATION_CONFIG = {
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

function App({
  userRole = "organizer",
  hideEventCreation = false,
  initialEventId = "",
  onBackToHome,
  onSelectEventId,
}) {
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const [selectedEvent, setSelectedEvent] = useState(() => initialEventId || sessionStorage.getItem("da3_selected_event") || "");
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [eventSwitcherOpen, setEventSwitcherOpen] = useState(false);
  const [activeSetupDrawer, setActiveSetupDrawer] = useState(null);
  const [mode, setMode] = useState("LIVE");
  const [simMode, setSimMode] = useState("NORMAL");
  const [loading, setLoading] = useState(true);

  function handleSelectEvent(id) {
    const strId = String(id);
    setSelectedEvent(strId);
    setSelectedZoneId(null);
    setEventSwitcherOpen(false);
    sessionStorage.setItem("da3_selected_event", strId);
    if (onSelectEventId) onSelectEventId(strId);
  }

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [zoneForm, setZoneForm] = useState(emptyZone);
  const [checkpointForm, setCheckpointForm] =
    useState(emptyCheckpoint);
  const [participantForm, setParticipantForm] =
    useState(emptyParticipant);
  const [trackingForm, setTrackingForm] =
    useState(emptyTracking);

  const simulationStart = useRef(0);

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
    const eventsData = await getEvents();
    const activeEventId = selectedEvent || (eventsData.length ? String(eventsData[0].id) : "");
    const [checkpointsData, participantsData, trackingData, alertsData] = await Promise.all([
      getCheckpoints(),
      activeEventId ? getParticipants(activeEventId) : Promise.resolve([]),
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
    let cancelled = false;

    (async () => {
      try {
        const eventsData = await getEvents();
        if (cancelled) return;
        setEvents(eventsData);

        const activeEventId = initialEventId || sessionStorage.getItem("da3_selected_event") || (eventsData.length ? String(eventsData[0].id) : "");
        const [checkpointsData, participantsData, trackingData, alertsData] = await Promise.all([
          getCheckpoints(),
          activeEventId ? getParticipants(activeEventId) : Promise.resolve([]),
          getTrackingEvents(),
          getAlerts(),
        ]);

        if (cancelled) return;
        setCheckpoints(checkpointsData);
        setParticipants(participantsData);
        setTrackingEvents(trackingData);
        setAlerts(alertsData);

        setSelectedEvent((current) => current || (eventsData.length ? String(eventsData[0].id) : ""));
      } catch (error) {
        if (!cancelled) notify(error.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialEventId]);

  useEffect(() => {
    if (!selectedEvent) return;
    let cancelled = false;

    Promise.all([
      getZones(selectedEvent),
      getDashboard(selectedEvent),
      getAnalytics(selectedEvent),
      getParticipants(selectedEvent),
    ])
      .then(([zonesData, dashboardData, analyticsData, participantsData]) => {
        if (cancelled) return;
        setZones(zonesData);
        setDashboard(dashboardData);
        setAnalytics(analyticsData);
        setParticipants(participantsData);
      })
      .catch((error) => {
        if (!cancelled) notify(error.message, "error");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEvent]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token: sessionStorage.getItem(TOKEN_KEY) },
    });

    if (selectedEvent) socket.emit("event:join", selectedEvent);

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

  const isSimulationActive =
    mode === "DEMO" &&
    Boolean(selectedEvent) &&
    eventCheckpoints.length > 0 &&
    participants.length > 0;

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
      setActiveSetupDrawer(null);

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
      setActiveSetupDrawer(null);

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
        eventId: Number(selectedEvent),
        token,
      });

      setParticipantForm(emptyParticipant);
      setActiveSetupDrawer(null);

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

  async function runSimulationStep() {
    if (
      !eventCheckpoints.length ||
      !participants.length
    ) {
      return;
    }

    const config =
      SIMULATION_CONFIG[simMode];

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

  const runSimulationStepRef = useRef(runSimulationStep);

  useEffect(() => {
    runSimulationStepRef.current = runSimulationStep;
  });

  useEffect(() => {
    if (!isSimulationActive) {
      return;
    }

    simulationStart.current = Date.now();

    const interval = setInterval(() => {
      runSimulationStepRef.current?.();
    }, SIMULATION_CONFIG[simMode].interval);

    return () => {
      clearInterval(interval);
    };
  }, [isSimulationActive, simMode]);

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
    <div className={`app app-role-${userRole} ${hideEventCreation ? "hide-event-creation" : ""}`}>

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
        {/* BREADCRUMB & QUICK EVENT SWITCHER (UI Design 10) */}
        <nav className="dashboard-breadcrumb-bar" aria-label="Breadcrumb navigation">
          <div className="breadcrumb-links">
            {onBackToHome && (
              <>
                <button type="button" className="breadcrumb-btn" onClick={onBackToHome}>
                  🏠 Home
                </button>
                <span className="breadcrumb-separator" aria-hidden="true">/</span>
              </>
            )}
            <span className="breadcrumb-item">Events</span>
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
            <span className="breadcrumb-current">
              {selectedEventObject?.name || "Active Event"}
            </span>
          </div>

          <div className="quick-event-switcher-wrapper">
            <button
              type="button"
              className="quick-event-switcher-pill"
              onClick={() => setEventSwitcherOpen((prev) => !prev)}
              aria-expanded={eventSwitcherOpen}
              aria-label="Switch monitored event"
            >
              <span className="event-live-dot" aria-hidden="true"></span>
              <span className="switcher-event-name">
                {selectedEventObject ? selectedEventObject.name : "Select Event"}
              </span>
              <span className="switcher-arrow" aria-hidden="true">▾</span>
            </button>

            {eventSwitcherOpen && (
              <div className="quick-event-dropdown" role="menu">
                <div className="dropdown-header">SWITCH MONITORED EVENT</div>
                {events.map((ev) => {
                  const isCurrent = String(ev.id) === String(selectedEvent);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`dropdown-event-item ${isCurrent ? "current" : ""}`}
                      onClick={() => handleSelectEvent(ev.id)}
                    >
                      <div className="dropdown-event-info">
                        <strong>{ev.name}</strong>
                        <span>{ev.description || "Monitored crowd event"}</span>
                      </div>
                      {isCurrent && <span className="dropdown-check">✓ Active</span>}
                    </button>
                  );
                })}
                {events.length === 0 && (
                  <div className="dropdown-empty">No other events found</div>
                )}
              </div>
            )}
          </div>
        </nav>

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
                handleSelectEvent(e.target.value)
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

            {selectedEvent && userRole === "organizer" && (
              <button className="delete-event-btn" onClick={handleDeleteEvent}>Delete Event</button>
            )}

          </div>
        </section>

        {loading ? (
          <SkeletonLoader />
        ) : (

          <>
            {/* STAFF SCAN TERMINAL (Item 4: Role-Based Staff View) */}
            {selectedEvent && userRole === "staff" && (
              <RoleScannerTerminal
                checkpoints={eventCheckpoints}
                participants={participants}
                onRecordScan={recordTrackingEvent}
              />
            )}

            {/* OVERVIEW WITH CIRCULAR RADIAL GAUGE (UI Design 3 & 9) */}
            {selectedEvent && (
              <section className="live-overview-section">

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

                <div className="overview-container-grid">
                  {/* Radial Gauge Card (Item 3 & Item 9) */}
                  <div className="stat-card radial-gauge-card">
                    <span className="card-micro-label">OVERALL CAPACITY</span>
                    <RadialGauge
                      value={utilization}
                      size={135}
                      strokeWidth={10}
                      status={
                        utilization >= 100
                          ? "CRITICAL"
                          : utilization >= 90
                          ? "HIGH"
                          : utilization >= 70
                          ? "WARNING"
                          : "NORMAL"
                      }
                    />
                    <div className="gauge-footer-note">
                      <span>{totalOccupancy.toLocaleString()} of {totalCapacity.toLocaleString()} max</span>
                    </div>
                  </div>

                  <div className="stats-grid-inner">
                    <div className="stat-card blue">
                      <div className="stat-top">
                        <span>
                          Total Capacity
                        </span>

                        <div className="stat-icon" aria-hidden="true">
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

                        <div className="stat-icon" aria-hidden="true">
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

                        <div className="stat-icon" aria-hidden="true">
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

                        <div className="stat-icon" aria-hidden="true">
                          !
                        </div>
                      </div>

                      <strong>
                        {eventAlerts.length}
                      </strong>

                      <p>
                        {eventAlerts.length
                          ? `${eventAlerts.length} zones require attention`
                          : "All zones normal"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* INTERACTIVE 2D VENUE FLOOR PLAN (UI Design 1) */}
            {selectedEvent && (
              <VenueFloorPlan
                zones={zones}
                checkpoints={eventCheckpoints}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
              />
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
                      const meta = getStatusMeta(status, zoneUtilization);
                      const isZoneFocused = selectedZoneId && Number(selectedZoneId) === Number(zone.id);

                      return (
                        <div
                          className={`zone-card ${isZoneFocused ? "zone-card-focused" : ""}`}
                          key={zone.id}
                          onClick={() => setSelectedZoneId(isZoneFocused ? null : zone.id)}
                          style={{ cursor: "pointer" }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Zone ${zone.name}: ${zone.current_occupancy} of ${zone.capacity} (${meta.label})`}
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
                              className={`status-badge ${meta.status.toLowerCase()}`}
                              role="status"
                              aria-label={meta.ariaLabel}
                            >
                              <span className="badge-geo-icon" aria-hidden="true">{meta.icon}</span>
                              <span>{meta.label}</span>
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

                          {/* Multi-tone smooth progress bar with threshold markers (Item 3 & Item 9) */}
                          <div className="zone-progress-wrapper">
                            <div className="zone-progress">
                              <div
                                className={`zone-progress-fill ${meta.status.toLowerCase()}`}
                                style={{
                                  width: `${Math.min(
                                    zoneUtilization,
                                    100
                                  )}%`,
                                }}
                              ></div>
                              <span className="threshold-marker mark-70" title="70% Warning threshold"></span>
                              <span className="threshold-marker mark-90" title="90% High threshold"></span>
                            </div>
                            <div className="zone-progress-indicators">
                              <span className="indicator-label">0%</span>
                              <span className="indicator-label">70% ▲</span>
                              <span className="indicator-label">90% ◆</span>
                              <span className="indicator-label">100% 🛑</span>
                            </div>
                          </div>

                          <div className="zone-footer">
                            <span>
                              Utilization
                            </span>

                            <strong style={{ color: meta.color }}>
                              <span className="badge-geo-icon" aria-hidden="true">{meta.icon}</span> {zoneUtilization}%
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

            {/* VENUE OPERATIONS HUB (Organizer Role Exclusive) */}
            {userRole === "organizer" && selectedEvent && (
              <section className="venue-operations-hub">

                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      VENUE OPERATIONS
                    </span>

                    <h2>
                      Venue Management Hub
                    </h2>
                  </div>

                  <div className="venue-meta-chips">
                    <span className="meta-chip">📍 {zones.length} {zones.length === 1 ? "Zone" : "Zones"}</span>
                    <span className="meta-chip">🚪 {eventCheckpoints.length} {eventCheckpoints.length === 1 ? "Gate" : "Gates"}</span>
                    <span className="meta-chip">🎟️ {participants.length} {participants.length === 1 ? "Attendee" : "Attendees"}</span>
                  </div>
                </div>

                {/* Quick Action Toolbar */}
                <div className="venue-action-toolbar" role="toolbar" aria-label="Venue setup actions">
                  <button
                    type="button"
                    className={`venue-hub-btn ${activeSetupDrawer === "zone" ? "active" : ""}`}
                    onClick={() => setActiveSetupDrawer((prev) => (prev === "zone" ? null : "zone"))}
                    aria-expanded={activeSetupDrawer === "zone"}
                  >
                    <span className="hub-btn-icon" aria-hidden="true">📍</span>
                    <div className="hub-btn-text">
                      <strong>+ Add Monitored Zone</strong>
                      <small>Define area & capacity limit</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`venue-hub-btn ${activeSetupDrawer === "checkpoint" ? "active" : ""}`}
                    onClick={() => setActiveSetupDrawer((prev) => (prev === "checkpoint" ? null : "checkpoint"))}
                    aria-expanded={activeSetupDrawer === "checkpoint"}
                  >
                    <span className="hub-btn-icon" aria-hidden="true">🚪</span>
                    <div className="hub-btn-text">
                      <strong>+ Add Gate / Checkpoint</strong>
                      <small>Configure entry/exit turnstiles</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`venue-hub-btn ${activeSetupDrawer === "participant" ? "active" : ""}`}
                    onClick={() => setActiveSetupDrawer((prev) => (prev === "participant" ? null : "participant"))}
                    aria-expanded={activeSetupDrawer === "participant"}
                  >
                    <span className="hub-btn-icon" aria-hidden="true">🎟️</span>
                    <div className="hub-btn-text">
                      <strong>+ Register Attendee</strong>
                      <small>Issue access badge / scan token</small>
                    </div>
                  </button>
                </div>

                {/* Drawer for Zone */}
                {activeSetupDrawer === "zone" && (
                  <div className="venue-setup-drawer" role="region" aria-label="Add Zone Drawer">
                    <div className="drawer-header">
                      <div className="drawer-title">
                        <span className="form-icon purple-bg" aria-hidden="true">01</span>
                        <div>
                          <h3>Add Monitored Zone</h3>
                          <p>Define an architectural area and set its maximum occupancy limit.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="drawer-close-btn"
                        onClick={() => setActiveSetupDrawer(null)}
                        aria-label="Close form"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleCreateZone} className="drawer-form">
                      <div className="form-row">
                        <div className="form-field">
                          <label>Zone Name</label>
                          <input
                            placeholder="e.g. Main Arena, North Hall, VIP Lounge"
                            value={zoneForm.name}
                            onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                            required
                            autoFocus
                          />
                        </div>
                        <div className="form-field">
                          <label>Maximum Capacity (People)</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="e.g. 250"
                            value={zoneForm.capacity}
                            onChange={(e) => setZoneForm({ ...zoneForm, capacity: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="drawer-actions">
                        <button type="submit" className="primary-btn">Create Zone</button>
                        <button type="button" className="ghost-btn" onClick={() => setActiveSetupDrawer(null)}>Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Drawer for Checkpoint */}
                {activeSetupDrawer === "checkpoint" && (
                  <div className="venue-setup-drawer" role="region" aria-label="Add Checkpoint Drawer">
                    <div className="drawer-header">
                      <div className="drawer-title">
                        <span className="form-icon orange-bg" aria-hidden="true">02</span>
                        <div>
                          <h3>Add Ingress / Egress Gate</h3>
                          <p>Configure a physical turnstile, barcode reader, or RFID gate attached to a zone.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="drawer-close-btn"
                        onClick={() => setActiveSetupDrawer(null)}
                        aria-label="Close form"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleCreateCheckpoint} className="drawer-form">
                      <div className="form-row">
                        <div className="form-field">
                          <label>Checkpoint Name</label>
                          <input
                            placeholder="e.g. Turnstile A - North Entry"
                            value={checkpointForm.name}
                            onChange={(e) => setCheckpointForm({ ...checkpointForm, name: e.target.value })}
                            required
                            autoFocus
                          />
                        </div>
                        <div className="form-field">
                          <label>Assigned Zone</label>
                          <select
                            value={checkpointForm.zone_id}
                            onChange={(e) => setCheckpointForm({ ...checkpointForm, zone_id: e.target.value })}
                            required
                          >
                            <option value="">Select a zone</option>
                            {zones.map((zone) => (
                              <option key={zone.id} value={zone.id}>
                                {zone.name} (Cap: {zone.capacity})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-field">
                          <label>Scanning Method</label>
                          <select
                            value={checkpointForm.type}
                            onChange={(e) => setCheckpointForm({ ...checkpointForm, type: e.target.value })}
                          >
                            <option value="QR">QR Code</option>
                            <option value="NFC">NFC Tap</option>
                            <option value="RFID">RFID Gate</option>
                            <option value="BARCODE">Barcode</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Flow Direction</label>
                          <select
                            value={checkpointForm.direction}
                            onChange={(e) => setCheckpointForm({ ...checkpointForm, direction: e.target.value })}
                          >
                            <option value="ENTRY">ENTRY (Increments Occupancy)</option>
                            <option value="EXIT">EXIT (Decrements Occupancy)</option>
                          </select>
                        </div>
                      </div>
                      <div className="drawer-actions">
                        <button type="submit" className="primary-btn">Create Checkpoint</button>
                        <button type="button" className="ghost-btn" onClick={() => setActiveSetupDrawer(null)}>Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Drawer for Participant */}
                {activeSetupDrawer === "participant" && (
                  <div className="venue-setup-drawer" role="region" aria-label="Register Participant Drawer">
                    <div className="drawer-header">
                      <div className="drawer-title">
                        <span className="form-icon green-bg" aria-hidden="true">03</span>
                        <div>
                          <h3>Register Attendee</h3>
                          <p>Issue an attendee pass or badge token for turnstile scan tracking.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="drawer-close-btn"
                        onClick={() => setActiveSetupDrawer(null)}
                        aria-label="Close form"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleCreateParticipant} className="drawer-form">
                      <div className="form-row">
                        <div className="form-field">
                          <label>Attendee Full Name</label>
                          <input
                            placeholder="e.g. John Doe"
                            value={participantForm.name}
                            onChange={(e) => setParticipantForm({ ...participantForm, name: e.target.value })}
                            required
                            autoFocus
                          />
                        </div>
                        <div className="form-field">
                          <label>Email Address</label>
                          <input
                            type="email"
                            placeholder="attendee@example.com"
                            value={participantForm.email}
                            onChange={(e) => setParticipantForm({ ...participantForm, email: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-field" style={{ flex: 1 }}>
                          <label>Participant Token (Optional)</label>
                          <input
                            placeholder="Leave blank to auto-generate secure token"
                            value={participantForm.token}
                            onChange={(e) => setParticipantForm({ ...participantForm, token: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="drawer-actions">
                        <button type="submit" className="primary-btn">Register Attendee</button>
                        <button type="button" className="ghost-btn" onClick={() => setActiveSetupDrawer(null)}>Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

              </section>
            )}

            {/* TRACKING (Hidden in Viewer Executive Kiosk Mode) */}
            {userRole !== "viewer" && (
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
                        isSimulationActive
                          ? "simulation-dot active"
                          : "simulation-dot"
                      }
                    ></span>

                    <div>
                      <strong>
                        {isSimulationActive
                          ? "SIMULATION ACTIVE"
                          : "SIMULATION PAUSED"}
                      </strong>

                      <span>
                        {isSimulationActive
                          ? "Automatic movement is running"
                          : "Add a participant and checkpoint to begin"}
                      </span>
                    </div>

                  </div>

                </div>
              )}

            </section>
            )}

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

export default App;