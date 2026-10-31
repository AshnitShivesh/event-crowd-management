import { useState } from "react";
import { getStatusMeta } from "./densityMeta";

export default function VenueFloorPlan({
  zones = [],
  checkpoints = [],
  selectedZoneId,
  onSelectZone,
}) {
  const [filterMode, setFilterMode] = useState("ALL"); // ALL, CONGESTED, NORMAL

  // Layout generator: maps zones dynamically onto an architectural blueprint coordinate space
  const layoutWidth = 900;
  const layoutHeight = 440;

  function calculateRoomBox(index, total) {
    if (total === 1) {
      return { x: 50, y: 50, width: 800, height: 340 };
    }
    if (total === 2) {
      const width = 380;
      return {
        x: 50 + index * 420,
        y: 60,
        width,
        height: 320,
      };
    }
    if (total === 3) {
      if (index === 0) return { x: 50, y: 60, width: 380, height: 320 };
      return {
        x: 460,
        y: 60 + (index - 1) * 170,
        width: 390,
        height: 150,
      };
    }
    if (total === 4) {
      const col = index % 2;
      const row = Math.floor(index / 2);
      return {
        x: 50 + col * 420,
        y: 50 + row * 180,
        width: 380,
        height: 155,
      };
    }
    // 5 to 6 zones
    const cols = total <= 4 ? 2 : 3;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const w = cols === 3 ? 260 : 380;
    const h = 150;
    return {
      x: 40 + col * (w + 30),
      y: 50 + row * (h + 30),
      width: w,
      height: h,
    };
  }

  const selectedZone = zones.find((z) => Number(z.id) === Number(selectedZoneId));

  const filteredZones = zones.filter((z) => {
    const util = z.capacity ? Math.round((z.current_occupancy / z.capacity) * 100) : 0;
    if (filterMode === "CONGESTED") return util >= 70;
    if (filterMode === "NORMAL") return util < 70;
    return true;
  });

  return (
    <div className="venue-floorplan-card">
      <div className="venue-floorplan-header">
        <div>
          <span className="eyebrow">SPATIAL MONITORING</span>
          <h3>Interactive 2D Venue Floor Plan</h3>
          <p>Real-time zone density layout with checkpoint ingress/egress pins.</p>
        </div>

        <div className="venue-floorplan-controls">
          <div className="filter-pill-group" role="group" aria-label="Floor plan density filter">
            <button
              type="button"
              className={`filter-pill ${filterMode === "ALL" ? "active" : ""}`}
              onClick={() => setFilterMode("ALL")}
            >
              All Zones ({zones.length})
            </button>
            <button
              type="button"
              className={`filter-pill alert ${filterMode === "CONGESTED" ? "active" : ""}`}
              onClick={() => setFilterMode("CONGESTED")}
            >
              ⚠️ Congested
            </button>
            <button
              type="button"
              className={`filter-pill normal ${filterMode === "NORMAL" ? "active" : ""}`}
              onClick={() => setFilterMode("NORMAL")}
            >
              ✓ Normal Flow
            </button>
          </div>
        </div>
      </div>

      <div className="venue-map-viewport">
        {zones.length === 0 ? (
          <div className="venue-map-empty">
            <span className="venue-empty-icon" aria-hidden="true">🗺️</span>
            <h4>No Zones Configured</h4>
            <p>Add zones in the Event Setup section below to generate the 2D venue plan.</p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${layoutWidth} ${layoutHeight}`}
            className="venue-map-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Subtle blueprint grid pattern */}
              <pattern id="blueprint-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.12" />
              </pattern>

              {/* Pulsing glow filter for critical capacity */}
              <filter id="critical-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Blueprint Outer Boundary & Grid */}
            <rect x="15" y="15" width={layoutWidth - 30} height={layoutHeight - 30} rx="12" className="venue-boundary" />
            <rect x="15" y="15" width={layoutWidth - 30} height={layoutHeight - 30} rx="12" fill="url(#blueprint-grid)" />

            {/* Venue Outer Entrance Label */}
            <text x={layoutWidth / 2} y="32" textAnchor="middle" className="venue-compass-text">
              VENUE PERIMETER • GROUND FLOOR LEVEL
            </text>

            {/* Zone Rooms */}
            {zones.map((zone, idx) => {
              const box = calculateRoomBox(idx, zones.length);
              const util = zone.capacity ? Math.round((zone.current_occupancy / zone.capacity) * 100) : 0;
              const meta = getStatusMeta("", util);
              const isSelected = selectedZoneId && Number(selectedZoneId) === Number(zone.id);
              const isDimmed = filterMode !== "ALL" && !filteredZones.some((fz) => fz.id === zone.id);
              const zoneCheckpoints = checkpoints.filter((cp) => Number(cp.zone_id) === Number(zone.id));

              return (
                <g
                  key={zone.id}
                  className={`room-group ${isSelected ? "room-selected" : ""} ${isDimmed ? "room-dimmed" : ""}`}
                  onClick={() => onSelectZone && onSelectZone(isSelected ? null : zone.id)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${zone.name}: ${zone.current_occupancy} of ${zone.capacity} (${util}% - ${meta.label})`}
                >
                  {/* Room Container Polygon */}
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    rx="8"
                    className="room-rect"
                    fill={meta.bgSoft}
                    stroke={meta.color}
                    strokeWidth={isSelected ? 3 : 1.75}
                    filter={meta.status === "CRITICAL" ? "url(#critical-glow)" : undefined}
                  />

                  {/* Room Header Banner */}
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={32}
                    rx="6"
                    fill="currentColor"
                    fillOpacity="0.08"
                  />

                  {/* Geometric Status Icon & Zone Name */}
                  <text x={box.x + 14} y={box.y + 21} className="room-title">
                    {meta.icon} {zone.name}
                  </text>

                  {/* Status Badge */}
                  <rect
                    x={box.x + box.width - 92}
                    y={box.y + 7}
                    width={80}
                    height={18}
                    rx="9"
                    fill={meta.color}
                    fillOpacity="0.22"
                  />
                  <text
                    x={box.x + box.width - 52}
                    y={box.y + 20}
                    textAnchor="middle"
                    className="room-status-badge-text"
                    fill={meta.color}
                  >
                    {meta.label}
                  </text>

                  {/* Central Metrics Display */}
                  <text x={box.x + 16} y={box.y + 68} className="room-metric-count">
                    {zone.current_occupancy}
                    <tspan className="room-metric-total"> / {zone.capacity} pax</tspan>
                  </text>

                  {/* Progress Bar inside SVG room */}
                  <rect
                    x={box.x + 16}
                    y={box.y + 82}
                    width={box.width - 32}
                    height={7}
                    rx="3.5"
                    fill="currentColor"
                    fillOpacity="0.12"
                  />
                  <rect
                    x={box.x + 16}
                    y={box.y + 82}
                    width={Math.max(0, ((box.width - 32) * Math.min(util, 100)) / 100)}
                    height={7}
                    rx="3.5"
                    fill={meta.color}
                  />

                  {/* Utilization Percentage */}
                  <text x={box.x + 16} y={box.y + 110} className="room-sub-label">
                    Utilization: <tspan fill={meta.color} fontWeight="700">{util}%</tspan>
                  </text>

                  {/* Checkpoint Doorway Pins on Room Perimeters */}
                  {zoneCheckpoints.map((cp, cpIdx) => {
                    const pinX = box.x + 24 + cpIdx * 84;
                    const pinY = box.y + box.height - 18;
                    const isEntry = cp.direction === "ENTRY";
                    return (
                      <g key={cp.id} className="checkpoint-door-pin" transform={`translate(${pinX}, ${pinY})`}>
                        <rect
                          x="0"
                          y="0"
                          width="76"
                          height="16"
                          rx="4"
                          fill={isEntry ? "rgba(34, 197, 94, 0.25)" : "rgba(59, 130, 246, 0.25)"}
                          stroke={isEntry ? "#22c55e" : "#3b82f6"}
                          strokeWidth="1"
                        />
                        <text x="38" y="11" textAnchor="middle" className="door-pin-text">
                          {isEntry ? "↘" : "↗"} {cp.name.length > 9 ? cp.name.slice(0, 8) + "…" : cp.name}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Selected Zone Inspection Panel */}
      {selectedZone && (
        <div className="zone-inspector-tray">
          <div className="inspector-left">
            <span className="inspector-tag">SELECTED ZONE INSPECTION</span>
            <h4>{selectedZone.name}</h4>
            <p>
              Current occupancy: <strong>{selectedZone.current_occupancy}</strong> / {selectedZone.capacity} (
              {selectedZone.capacity
                ? Math.round((selectedZone.current_occupancy / selectedZone.capacity) * 100)
                : 0}
              %)
            </p>
          </div>

          <div className="inspector-checkpoints">
            <span>Connected Gates:</span>
            <div className="inspector-badges">
              {checkpoints
                .filter((cp) => Number(cp.zone_id) === Number(selectedZone.id))
                .map((cp) => (
                  <span key={cp.id} className={`gate-pill ${cp.direction.toLowerCase()}`}>
                    {cp.direction === "ENTRY" ? "↘ IN:" : "↗ OUT:"} {cp.name}
                  </span>
                ))}
              {checkpoints.filter((cp) => Number(cp.zone_id) === Number(selectedZone.id)).length === 0 && (
                <span className="no-gates-note">No checkpoints attached to this zone.</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="inspector-close-btn"
            onClick={() => onSelectZone && onSelectZone(null)}
            aria-label="Close zone inspection"
          >
            Clear selection ✕
          </button>
        </div>
      )}
    </div>
  );
}
