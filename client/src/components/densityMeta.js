export function getStatusMeta(status, utilization = 0) {
  const normStatus = String(status || "").toUpperCase();
  if (normStatus === "CRITICAL" || utilization >= 100) {
    return {
      status: "CRITICAL",
      label: "Critical",
      icon: "🛑",
      symbol: "⬢",
      color: "#ef4444",
      gradient: ["#dc2626", "#f43f5e"],
      solidBg: "#dc2626",
      bgSoft: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.4)",
      ariaLabel: "Critical over-capacity: immediate attention needed",
    };
  }
  if (normStatus === "HIGH" || utilization >= 90) {
    return {
      status: "HIGH",
      label: "High Density",
      icon: "◆",
      symbol: "◆",
      color: "#f97316",
      gradient: ["#ea580c", "#fb923c"],
      solidBg: "#ea580c",
      bgSoft: "rgba(249, 115, 22, 0.15)",
      border: "rgba(249, 115, 22, 0.4)",
      ariaLabel: "High density: approaching capacity",
    };
  }
  if (normStatus === "WARNING" || utilization >= 70) {
    return {
      status: "WARNING",
      label: "Moderate Flow",
      icon: "▲",
      symbol: "▲",
      color: "#f59e0b",
      gradient: ["#d97706", "#fcd34d"],
      solidBg: "#d97706",
      bgSoft: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.4)",
      ariaLabel: "Moderate density: monitoring recommended",
    };
  }
  return {
    status: "NORMAL",
    label: "Normal Flow",
    icon: "✓",
    symbol: "●",
    color: "#10b981",
    gradient: ["#059669", "#34d399"],
    solidBg: "#059669",
    bgSoft: "rgba(16, 185, 129, 0.15)",
    border: "rgba(16, 185, 129, 0.4)",
    ariaLabel: "Normal crowd flow: within safe limits",
  };
}
