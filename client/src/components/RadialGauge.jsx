import { getStatusMeta } from "./densityMeta";

export default function RadialGauge({ value = 0, size = 130, strokeWidth = 10, status = "NORMAL" }) {
  const meta = getStatusMeta(status, value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="radial-gauge-container"
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Event utilization gauge: ${clamped}% (${meta.label})`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radial-gauge-svg">
        <circle
          className="radial-gauge-bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="radial-gauge-bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={meta.color}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="radial-gauge-content">
        <span className="radial-gauge-value">{clamped}%</span>
        <span className="radial-gauge-badge" style={{ color: meta.color }}>
          <span className="density-icon" aria-hidden="true">{meta.icon}</span>
          <span>{meta.label}</span>
        </span>
      </div>
    </div>
  );
}
