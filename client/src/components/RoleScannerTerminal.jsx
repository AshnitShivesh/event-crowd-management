import { useState } from "react";

export default function RoleScannerTerminal({
  checkpoints = [],
  participants = [],
  onRecordScan,
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(
    checkpoints[0]?.id ? String(checkpoints[0].id) : ""
  );
  const [direction, setDirection] = useState("ENTRY");
  const [busy, setBusy] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  // Sync checkpoint default if none selected yet
  const activeCheckpointId =
    selectedCheckpoint || (checkpoints[0]?.id ? String(checkpoints[0].id) : "");

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    const token = tokenInput.trim();
    if (!token || !activeCheckpointId) return;

    setBusy(true);
    try {
      const res = await onRecordScan({
        token,
        checkpoint_id: Number(activeCheckpointId),
        direction,
        source: "STAFF_TERMINAL",
      });
      const cpName = checkpoints.find((c) => String(c.id) === String(activeCheckpointId))?.name || "Gate";
      setLastScanResult({
        success: true,
        message: `Scanned ${token} [${direction}] at ${cpName} (${res?.zone?.name || "Zone"}: ${res?.zone?.current_occupancy}/${res?.zone?.capacity} pax)`,
        time: new Date().toLocaleTimeString(),
      });
      setTokenInput("");
    } catch (err) {
      setLastScanResult({
        success: false,
        message: err.message || "Failed to record scan",
        time: new Date().toLocaleTimeString(),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleQuickParticipant(pToken) {
    setTokenInput(pToken);
  }

  return (
    <section className="staff-scanner-terminal-card" aria-label="Staff Turnstile Scanner Terminal">
      <div className="terminal-header">
        <div>
          <span className="terminal-badge">STAFF SCAN TERMINAL</span>
          <h3>Gate Check-in Station</h3>
          <p>Scan or select attendee tokens to record immediate turnstile movement.</p>
        </div>

        <div className="direction-toggle-group" role="group" aria-label="Ingress or Egress direction">
          <button
            type="button"
            className={`direction-toggle-btn entry ${direction === "ENTRY" ? "active" : ""}`}
            onClick={() => setDirection("ENTRY")}
          >
            ↘ ENTRY (In)
          </button>
          <button
            type="button"
            className={`direction-toggle-btn exit ${direction === "EXIT" ? "active" : ""}`}
            onClick={() => setDirection("EXIT")}
          >
            ↗ EXIT (Out)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="terminal-form">
        <div className="terminal-inputs-row">
          <div className="terminal-input-block">
            <label htmlFor="terminal-checkpoint">Assigned Gate / Checkpoint</label>
            <select
              id="terminal-checkpoint"
              value={activeCheckpointId}
              onChange={(e) => setSelectedCheckpoint(e.target.value)}
              className="terminal-select"
            >
              {checkpoints.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name} ({cp.direction})
                </option>
              ))}
              {checkpoints.length === 0 && <option value="">No checkpoints available</option>}
            </select>
          </div>

          <div className="terminal-input-block grow">
            <label htmlFor="terminal-token">Attendee Token / QR String</label>
            <div className="token-input-wrapper">
              <input
                id="terminal-token"
                type="text"
                placeholder="Scan or enter token (e.g. EVT-001)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="terminal-text-input"
                autoComplete="off"
                required
              />
              <button
                type="submit"
                disabled={busy || !tokenInput.trim() || !activeCheckpointId}
                className={`terminal-scan-action-btn ${direction.toLowerCase()}`}
              >
                {busy ? "Recording…" : `RECORD ${direction}`}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Participant Token Chips */}
        {participants.length > 0 && (
          <div className="quick-token-chips">
            <span className="chips-label">Quick Attendees:</span>
            <div className="chips-scroll">
              {participants.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`token-chip ${tokenInput === p.token ? "active" : ""}`}
                  onClick={() => handleQuickParticipant(p.token)}
                  title={`Select ${p.name} (${p.token})`}
                >
                  <span className="chip-name">{p.name}</span>
                  <span className="chip-token">{p.token}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Immediate Audio-Visual Feedback Banner */}
      {lastScanResult && (
        <div
          className={`scan-feedback-banner ${lastScanResult.success ? "success" : "error"}`}
          role="status"
          aria-live="polite"
        >
          <span className="feedback-icon" aria-hidden="true">
            {lastScanResult.success ? "✓" : "⚠"}
          </span>
          <div className="feedback-body">
            <strong>{lastScanResult.success ? "SCAN RECORDED" : "SCAN REJECTED"}</strong>
            <span>{lastScanResult.message}</span>
          </div>
          <span className="feedback-time">{lastScanResult.time}</span>
        </div>
      )}
    </section>
  );
}
