
export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export const TOKEN_KEY = "da3_access_token";
export const USER_KEY = "da3_user";

export function clearStoredAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

async function request(endpoint, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { error: "The server returned an invalid response." };
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      token &&
      !endpoint.startsWith("/auth/")
    ) {
      clearStoredAuth();
      window.dispatchEvent(new CustomEvent("da3:unauthorized"));
    }

    throw new Error(data.error || "API request failed");
  }

  return data;
}

export const getAuthStatus = () => request("/auth/status");

export const bootstrapAccount = (account) =>
  request("/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify(account),
  });

export const registerAccount = (account) =>
  request("/auth/register", {
    method: "POST",
    body: JSON.stringify(account),
  });

export const getAccount = () => request("/account");

export const updateAccountDetails = (account) =>
  request("/account", {
    method: "PUT",
    body: JSON.stringify({
      name: account.name,
      email: account.email,
      currentPassword: account.currentPassword,
    }),
  });

export const updateAccount = updateAccountDetails;

export const addEventMember = (eventId, member) =>
  request(`/events/${eventId}/members`, {
    method: "POST",
    body: JSON.stringify(member),
  });

export const login = (credentials) =>
  request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

export const verifyMfaEnrollment = (setupToken, code) =>
  request("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ setupToken, code }),
  });

export const completeMfaLogin = (challengeToken, code) =>
  request("/auth/mfa/complete", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
  });

export const logout = () =>
  request("/auth/logout", { method: "POST" });

export const getEvents = () => request("/events");

export const getEvent = (id) => request(`/events/${id}`);

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
  request(`/events/${id}`, { method: "DELETE" });

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

export const getCheckpoints = () => request("/checkpoints");

export const createCheckpoint = (checkpoint) =>
  request("/checkpoints", {
    method: "POST",
    body: JSON.stringify({
      zoneId: Number(checkpoint.zone_id),
      name: checkpoint.name,
      type: checkpoint.type,
      direction: checkpoint.direction,
    }),
  });

export const getParticipants = () => request("/participants");

export const createParticipant = (participant) =>
  request("/participants", {
    method: "POST",
    body: JSON.stringify(participant),
  });

export const recordTrackingEvent = (event) =>
  request("/tracking", {
    method: "POST",
    body: JSON.stringify({
      participantToken: event.token,
      checkpointId: Number(event.checkpoint_id),
      direction: event.direction,
      source: event.source,
    }),
  });

export const getTrackingEvents = () => request("/tracking");

export const getDashboard = (eventId) =>
  request(`/dashboard/${eventId}`);

export const getAnalytics = (eventId) =>
  request(`/analytics/${eventId}`);

export const getAlerts = () => request("/alerts");
