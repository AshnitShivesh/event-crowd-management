import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import {
  TOKEN_KEY,
  USER_KEY,
  addEventMember,
  bootstrapAccount,
  clearStoredAuth,
  completeMfaLogin,
  createEvent,
  getAccount,
  getAuthStatus,
  getEvents,
  login,
  logout,
  registerAccount,
  verifyMfaEnrollment,
} from "./api";
import "./index.css";
import "./App.css";

const emptyCredentials = { email: "", password: "" };
const emptyAccount = { name: "", email: "", password: "", role: "viewer" };
const emptyEvent = { name: "", description: "", start_time: "", end_time: "" };

function isActive(event) {
  if (["COMPLETED", "CANCELLED", "CANCELED", "ENDED"].includes(String(event.status || "").toUpperCase())) return false;
  return !event.end_time || new Date(event.end_time).getTime() >= Date.now();
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [stage, setStage] = useState("login");
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [account, setAccount] = useState(emptyAccount);
  const [code, setCode] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("home");
  const [events, setEvents] = useState([]);
  const [accountData, setAccountData] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [memberForm, setMemberForm] = useState({ eventId: "", email: "", role: "viewer" });
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [dashboardEventId, setDashboardEventId] = useState("");

  useEffect(() => {
    let active = true;
    async function initialize() {
      const savedToken = sessionStorage.getItem(TOKEN_KEY);
      const savedUser = sessionStorage.getItem(USER_KEY);
      try {
        const status = await getAuthStatus();
        if (!active) return;
        setNeedsBootstrap(Boolean(status.needsBootstrap));
        if (status.needsBootstrap) setStage("bootstrap");
      } catch (err) {
        if (!active) return;
        setError(`Unable to contact the authentication service: ${err.message}`);
      }
      if (savedToken && savedUser) {
        try {
          await getEvents();
          if (!active) return;
          setUser(JSON.parse(savedUser));
        } catch (_) { clearStoredAuth(); }
      }
      if (active) setAuthReady(true);
    }
    initialize();
    const onUnauthorized = () => {
      clearStoredAuth(); setUser(null); setStage("login"); setCode("");
      setError("Your session expired or is no longer valid. Please sign in again.");
    };
    window.addEventListener("da3:unauthorized", onUnauthorized);
    return () => { active = false; window.removeEventListener("da3:unauthorized", onUnauthorized); };
  }, []);

  async function refreshAccount() {
    const [eventList, details] = await Promise.all([getEvents(), getAccount()]);
    setEvents(eventList);
    setAccountData(details);
    if (!memberForm.eventId && eventList.length) setMemberForm((prev) => ({ ...prev, eventId: String(eventList[0].id) }));
  }

  useEffect(() => {
    if (!user) return;
    refreshAccount().catch((err) => setPageError(err.message));
  }, [user]);

  function saveSession(result) {
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user); setStage("login"); setCode(""); setSetupToken("");
    setChallengeToken(""); setQrCodeDataUrl(""); setError(""); setNotice("Signed in successfully.");
    setTab("home");
  }

  async function handleBootstrap(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await bootstrapAccount(account);
      setCredentials({ email: account.email, password: account.password });
      setStage("login"); setNeedsBootstrap(false);
      setNotice("Organizer account created. Sign in to set up MFA.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleRegister(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await registerAccount(account);
      setCredentials({ email: account.email, password: account.password });
      setStage("login"); setNotice("Account created. Sign in to set up authenticator MFA.");
      setAccount(emptyAccount);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleLogin(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await login(credentials);
      if (result.requiresEnrollment) {
        setSetupToken(result.setupToken); setQrCodeDataUrl(result.qrCodeDataUrl); setStage("enroll");
        setNotice("Scan the QR code in your authenticator app, then enter its current six-digit code.");
      } else if (result.requiresMfa) {
        setChallengeToken(result.challengeToken); setStage("mfa");
        setNotice("Enter the current six-digit code from your authenticator app.");
      } else setError("The authentication service returned an unexpected response.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleEnrollment(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { saveSession(await verifyMfaEnrollment(setupToken, code.trim())); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleMfaLogin(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { saveSession(await completeMfaLogin(challengeToken, code.trim())); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleLogout() {
    try { await logout(); } catch (_) { /* Clear local session even if the API is unreachable. */ }
    clearStoredAuth(); setUser(null); setStage(needsBootstrap ? "bootstrap" : "login");
    setCredentials(emptyCredentials); setCode(""); setError(""); setNotice("You have been signed out.");
    setEvents([]); setAccountData(null); setTab("home");
  }

  async function handleCreateEvent(event) {
    event.preventDefault(); setPageBusy(true); setPageError(""); setPageNotice("");
    try {
      const created = await createEvent(eventForm);
      setEventForm(emptyEvent); await refreshAccount();
      setPageNotice(`“${created.name}” was created successfully.`); setTab("home");
    } catch (err) { setPageError(err.message); } finally { setPageBusy(false); }
  }

  async function handleAddMember(event) {
    event.preventDefault(); setPageBusy(true); setPageError(""); setPageNotice("");
    try {
      const result = await addEventMember(memberForm.eventId, { email: memberForm.email, role: memberForm.role });
      setPageNotice(result.message); setMemberForm((prev) => ({ ...prev, email: "" }));
    } catch (err) { setPageError(err.message); } finally { setPageBusy(false); }
  }

  function openDashboard(eventId) {
    sessionStorage.setItem("da3_selected_event", String(eventId));
    setDashboardEventId(String(eventId)); setTab("dashboard");
  }

  if (!authReady) return <div className="auth-screen"><div className="auth-card"><div className="auth-brand-mark">EC</div><h1>Event Crowd Management</h1><p>Checking your secure session…</p><div className="auth-spinner" /></div></div>;

  if (!user) {
    const formTitle = stage === "bootstrap" ? "Create the first organizer" : stage === "register" ? "Create your account" : stage === "enroll" ? "Set up authenticator MFA" : stage === "mfa" ? "Verify your identity" : "Sign in to your dashboard";
    return <main className="auth-screen"><section className="auth-card">
      <div className="auth-brand-mark">EC</div><p className="auth-eyebrow">REAL-TIME CROWD MANAGEMENT</p><h1>{formTitle}</h1>
      <p className="auth-description">{stage === "register" ? "Create a Staff or Viewer account. Organizer accounts are created through the protected initial setup only." : stage === "bootstrap" ? "Create the initial organizer account. This is available only when the server permits first-time setup." : stage === "enroll" ? "Your account needs an authenticator app before the dashboard can be opened." : stage === "mfa" ? "Enter the six-digit code from your authenticator app to finish signing in." : "Use your account credentials and complete multi-factor verification to continue."}</p>
      {error && <div className="auth-message auth-error" role="alert">{error}</div>}{notice && <div className="auth-message auth-notice" role="status">{notice}</div>}
      {(stage === "bootstrap" || stage === "register") && <form className="auth-form" onSubmit={stage === "bootstrap" ? handleBootstrap : handleRegister}>
        <label>Full name<input autoComplete="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} required maxLength={100} /></label>
        <label>Email<input type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} required maxLength={254} /></label>
        {stage === "register" && <label>Account role<select value={account.role} onChange={(e) => setAccount({ ...account, role: e.target.value })}><option value="viewer">Viewer</option><option value="staff">Staff</option></select></label>}
        <label>Password<input type="password" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} required minLength={12} maxLength={72} /></label>
        <p className="auth-hint">Use at least 12 characters. MFA setup is required at first sign-in.</p>
        <button className="auth-primary-button" disabled={busy}>{busy ? "Creating account…" : stage === "bootstrap" ? "Create organizer account" : "Create account"}</button>
        {stage === "register" && <button type="button" className="auth-secondary-button" onClick={() => { setStage("login"); setError(""); setNotice(""); }}>Back to sign in</button>}
      </form>}
      {stage === "login" && <form className="auth-form" onSubmit={handleLogin}>
        <label>Email<input type="email" autoComplete="username" value={credentials.email} onChange={(e) => setCredentials({ ...credentials, email: e.target.value })} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} required /></label>
        <button className="auth-primary-button" disabled={busy}>{busy ? "Checking credentials…" : "Continue"}</button>
        <button type="button" className="auth-secondary-button" onClick={() => { setStage("register"); setError(""); setNotice(""); }}>Create new account</button>
        {needsBootstrap && <button type="button" className="auth-secondary-button" onClick={() => { setStage("bootstrap"); setError(""); setNotice(""); }}>Create first organizer account</button>}
      </form>}
      {stage === "enroll" && <form className="auth-form" onSubmit={handleEnrollment}>{qrCodeDataUrl && <div className="auth-qr-wrap"><img src={qrCodeDataUrl} alt="Authenticator enrollment QR code" /><p>Scan with your authenticator app.</p></div>}<label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label><button className="auth-primary-button" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and enable MFA"}</button><button type="button" className="auth-secondary-button" onClick={() => { setStage("login"); setCode(""); setError(""); setNotice(""); }}>Back to sign in</button></form>}
      {stage === "mfa" && <form className="auth-form" onSubmit={handleMfaLogin}><label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label><button className="auth-primary-button" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and sign in"}</button><button type="button" className="auth-secondary-button" onClick={() => { setStage("login"); setCode(""); setChallengeToken(""); setError(""); setNotice(""); }}>Back to sign in</button></form>}
      <div className="auth-footer">Protected with password hashing, TOTP MFA and server-side authorization.</div>
    </section></main>;
  }

  const activeEvents = events.filter(isActive);
  const roleLabel = { organizer: "Organizer", staff: "Staff", viewer: "Viewer" }[user.role] || user.role;
  const visibleAccountEvents = accountData?.events || [];

  return <div className="authenticated-app role-workspace">
    <header className="workspace-header"><div><span className="auth-session-label">EVENT CROWD MANAGEMENT</span><h1>Welcome, {user.name}</h1><p>{user.email} · {roleLabel}</p></div><button type="button" className="auth-logout-button" onClick={handleLogout}>Sign out</button></header>
    <nav className="workspace-nav" aria-label="Main navigation">
      <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>Home</button>
      {user.role === "organizer" && <button className={tab === "create" ? "active" : ""} onClick={() => { setTab("create"); setPageError(""); setPageNotice(""); }}>Create event</button>}
      <button className={tab === "account" ? "active" : ""} onClick={() => { setTab("account"); setPageError(""); setPageNotice(""); }}>My account</button>
      {tab === "dashboard" && <button className="active" onClick={() => setTab("dashboard")}>Event dashboard</button>}
    </nav>
    {pageError && <div className="workspace-message error" role="alert">{pageError}</div>}{pageNotice && <div className="workspace-message success" role="status">{pageNotice}</div>}

    {tab === "home" && <main className="workspace-content">
      {user.role === "organizer" && <section className="workspace-section"><div className="workspace-section-heading"><div><span className="auth-eyebrow">YOUR EVENTS</span><h2>Active events you organize</h2></div><button className="auth-primary-button compact" onClick={() => setTab("create")}>+ Create event</button></div>
        {activeEvents.length ? <div className="workspace-event-grid">{activeEvents.map((event) => <article className="workspace-event-card" key={event.id}><span className="workspace-role-chip">Organizer</span><h3>{event.name}</h3><p>{event.description || "No description provided."}</p><div className="workspace-event-meta">{event.start_time ? new Date(event.start_time).toLocaleString() : "Start time not set"}</div><button className="auth-primary-button" onClick={() => openDashboard(event.id)}>Open dashboard</button></article>)}</div> : <div className="workspace-empty"><h3>No active events yet</h3><p>Create an event to start configuring zones, checkpoints and crowd monitoring.</p><button className="auth-primary-button" onClick={() => setTab("create")}>Create your first event</button></div>}
      </section>}
      {(user.role === "staff" || user.role === "viewer") && <section className="workspace-section"><div className="workspace-section-heading"><div><span className="auth-eyebrow">ASSIGNED EVENTS</span><h2>Active events you’re part of</h2></div></div>
        {activeEvents.length ? <div className="workspace-event-grid">{activeEvents.map((event) => <article className="workspace-event-card" key={event.id}><span className="workspace-role-chip">{roleLabel}</span><h3>{event.name}</h3><p>{event.description || "No description provided."}</p><div className="workspace-event-meta">{event.start_time ? new Date(event.start_time).toLocaleString() : "Start time not set"}</div><button className="auth-primary-button" onClick={() => openDashboard(event.id)}>View event</button></article>)}</div> : <div className="workspace-empty"><h3>No active events assigned</h3><p>Ask an event organizer to add your registered email to an event.</p></div>}
      </section>}
    </main>}

    {tab === "create" && user.role === "organizer" && <main className="workspace-content"><section className="workspace-form-card"><span className="auth-eyebrow">EVENT SETUP</span><h2>Create a new event</h2><p>This is a separate workspace from the live monitoring dashboard.</p><form className="auth-form" onSubmit={handleCreateEvent}><label>Event name<input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} maxLength={150} required /></label><label>Description<textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={3} /></label><div className="workspace-two-columns"><label>Start time<input type="datetime-local" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} /></label><label>End time<input type="datetime-local" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} /></label></div><button className="auth-primary-button" disabled={pageBusy}>{pageBusy ? "Creating…" : "Create event"}</button></form></section></main>}

    {tab === "account" && <main className="workspace-content"><section className="workspace-form-card"><span className="auth-eyebrow">ACCOUNT DETAILS</span><h2>My account</h2><div className="account-detail-grid"><div><span>Full name</span><strong>{user.name}</strong></div><div><span>Email</span><strong>{user.email}</strong></div><div><span>Role</span><strong>{roleLabel}</strong></div><div><span>Multi-factor authentication</span><strong>{accountData?.user?.totp_enabled ? "Enabled" : "Not confirmed"}</strong></div><div><span>Account created</span><strong>{accountData?.user?.created_at ? new Date(accountData.user.created_at).toLocaleDateString() : "—"}</strong></div></div></section>
      <section className="workspace-section"><div className="workspace-section-heading"><div><span className="auth-eyebrow">EVENT HISTORY</span><h2>{user.role === "viewer" ? "Events participated in" : user.role === "staff" ? "Events worked" : "Events organized"}</h2></div></div>{visibleAccountEvents.length ? <div className="workspace-event-grid">{visibleAccountEvents.map((event) => <article className="workspace-event-card" key={event.id}><h3>{event.name}</h3><p>{event.description || "No description provided."}</p><div className="workspace-event-meta">{event.start_time ? new Date(event.start_time).toLocaleString() : "Start time not set"}</div>{isActive(event) && <button className="auth-secondary-button" onClick={() => openDashboard(event.id)}>Open event</button>}</article>)}</div> : <div className="workspace-empty"><p>No events are associated with this account yet.</p></div>}</section>
      {user.role === "organizer" && <section className="workspace-form-card"><span className="auth-eyebrow">TEAM ACCESS</span><h2>Add staff or viewers to an event</h2><p>People must register first using the same email and matching role.</p><form className="auth-form" onSubmit={handleAddMember}><label>Event<select value={memberForm.eventId} onChange={(e) => setMemberForm({ ...memberForm, eventId: e.target.value })} required><option value="">Choose an event</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></label><label>Account email<input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} required /></label><label>Role<select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}><option value="viewer">Viewer</option><option value="staff">Staff</option></select></label><button className="auth-primary-button" disabled={pageBusy || !memberForm.eventId}>{pageBusy ? "Adding…" : "Add to event"}</button></form></section>}
    </main>}

    {tab === "dashboard" && dashboardEventId && <div className={`workspace-dashboard role-${user.role}`}><button className="dashboard-back-button" onClick={() => setTab("home")}>← Back to home</button><Dashboard userRole={user.role} hideEventCreation initialEventId={dashboardEventId} /></div>}
  </div>;
}

export default App;
