const API_URL = "http://localhost:5000/api";

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API request failed");
  }

  return data;
}

// Events
export const getEvents = () =>
  request("/events");

export const createEvent = (event) =>
  request("/events", {
    method: "POST",
    body: JSON.stringify(event),
  });

// Zones
export const getZones = (eventId) =>
  request(`/events/${eventId}/zones`);

export const createZone = (zone) =>
  request("/zones", {
    method: "POST",
    body: JSON.stringify(zone),
  });

// Checkpoints
export const getCheckpoints = () =>
  request("/checkpoints");

export const createCheckpoint = (checkpoint) =>
  request("/checkpoints", {
    method: "POST",
    body: JSON.stringify(checkpoint),
  });

// Participants
export const getParticipants = () =>
  request("/participants");

export const createParticipant = (participant) =>
  request("/participants", {
    method: "POST",
    body: JSON.stringify(participant),
  });

// Tracking
export const recordTrackingEvent = (event) =>
  request("/tracking", {
    method: "POST",
    body: JSON.stringify(event),
  });

export const getTrackingEvents = () =>
  request("/tracking");

// Dashboard
export const getDashboard = (eventId) =>
  request(`/dashboard/${eventId}`);

// Alerts
export const getAlerts = () =>
  request("/alerts");
export const getAnalytics = (eventId) =>
  request(`/analytics/${eventId}`);