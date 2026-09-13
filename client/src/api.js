export const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

async function request(endpoint, options = {}) {
  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    }
  );

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      data.error || "API request failed"
    );
  }

  return data;
}

export const getEvents = () =>
  request("/events");

export const getEvent = (id) =>
  request(`/events/${id}`);

export const createEvent = (event) =>
  request("/events", {
    method: "POST",
    body: JSON.stringify({
      name: event.name,
      description: event.description,
      startTime: event.start_time,
      endTime: event.end_time,
    }),
  });

export const deleteEvent = (id) =>
  request(`/events/${id}`, {
    method: "DELETE",
  });

export const getZones = (eventId) =>
  request(`/events/${eventId}/zones`);

export const createZone = (zone) =>
  request("/zones", {
    method: "POST",
    body: JSON.stringify({
      eventId: Number(zone.event_id),
      name: zone.name,
      capacity: Number(zone.capacity),
    }),
  });

export const getCheckpoints = () =>
  request("/checkpoints");

export const createCheckpoint = (
  checkpoint
) =>
  request("/checkpoints", {
    method: "POST",
    body: JSON.stringify({
      zoneId: Number(
        checkpoint.zone_id
      ),
      name: checkpoint.name,
      type: checkpoint.type,
      direction: checkpoint.direction,
    }),
  });

export const getParticipants = () =>
  request("/participants");

export const createParticipant = (
  participant
) =>
  request("/participants", {
    method: "POST",
    body: JSON.stringify(participant),
  });

export const recordTrackingEvent = (
  event
) =>
  request("/tracking", {
    method: "POST",
    body: JSON.stringify({
      participantToken: event.token,
      checkpointId: Number(
        event.checkpoint_id
      ),
      direction: event.direction,
      source: event.source,
    }),
  });

export const getTrackingEvents = () =>
  request("/tracking");

export const getDashboard = (eventId) =>
  request(`/dashboard/${eventId}`);

export const getAnalytics = (eventId) =>
  request(`/analytics/${eventId}`);

export const getAlerts = () =>
  request("/alerts");