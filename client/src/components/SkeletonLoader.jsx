export default function SkeletonLoader() {
  return (
    <div className="skeleton-dashboard-wrapper" aria-busy="true" aria-label="Loading event crowd data...">
      {/* Skeleton Hero / Top bar */}
      <div className="skeleton-card skeleton-hero">
        <div className="skeleton-line skeleton-title shimmer" style={{ width: "35%" }}></div>
        <div className="skeleton-line skeleton-subtitle shimmer" style={{ width: "55%" }}></div>
      </div>

      {/* Skeleton Stats Grid */}
      <div className="skeleton-stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card skeleton-stat shimmer">
            <div className="skeleton-line skeleton-text" style={{ width: "50%" }}></div>
            <div className="skeleton-line skeleton-metric" style={{ width: "40%", height: "36px" }}></div>
            <div className="skeleton-line skeleton-sub" style={{ width: "70%" }}></div>
          </div>
        ))}
      </div>

      {/* Skeleton 2D Venue Map */}
      <div className="skeleton-card skeleton-map shimmer">
        <div className="skeleton-line skeleton-title" style={{ width: "25%", marginBottom: "16px" }}></div>
        <div className="skeleton-map-canvas">
          <div className="skeleton-map-room"></div>
          <div className="skeleton-map-room"></div>
          <div className="skeleton-map-room"></div>
        </div>
      </div>

      {/* Skeleton Zones Grid */}
      <div className="skeleton-zones-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card skeleton-zone shimmer">
            <div className="skeleton-line skeleton-title" style={{ width: "60%" }}></div>
            <div className="skeleton-line skeleton-text" style={{ width: "40%" }}></div>
            <div className="skeleton-line skeleton-bar" style={{ height: "10px", marginTop: "14px" }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
