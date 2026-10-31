const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

describe("Crowd Tracking & Capacity Calculation Logic", () => {
  function calculateStatus(occupancy, capacity) {
    if (!capacity) return "NORMAL";
    const utilization = (occupancy / capacity) * 100;
    if (utilization >= 100) return "CRITICAL";
    if (utilization >= 90) return "HIGH";
    if (utilization >= 70) return "WARNING";
    return "NORMAL";
  }

  function simulateOccupancyChange(current, capacity, direction) {
    if (direction === "ENTRY") {
      return Math.min(current + 1, capacity);
    }
    if (direction === "EXIT") {
      return Math.max(current - 1, 0);
    }
    throw new Error("Invalid direction");
  }

  test("Utilization maps accurately to status tiers", () => {
    assert.equal(calculateStatus(0, 100), "NORMAL");
    assert.equal(calculateStatus(69, 100), "NORMAL");
    assert.equal(calculateStatus(70, 100), "WARNING");
    assert.equal(calculateStatus(89, 100), "WARNING");
    assert.equal(calculateStatus(90, 100), "HIGH");
    assert.equal(calculateStatus(99, 100), "HIGH");
    assert.equal(calculateStatus(100, 100), "CRITICAL");
    assert.equal(calculateStatus(120, 100), "CRITICAL");
  });

  test("Occupancy change does not exceed capacity on ENTRY", () => {
    assert.equal(simulateOccupancyChange(50, 100, "ENTRY"), 51);
    assert.equal(simulateOccupancyChange(100, 100, "ENTRY"), 100);
  });

  test("Occupancy change does not drop below zero on EXIT", () => {
    assert.equal(simulateOccupancyChange(10, 100, "EXIT"), 9);
    assert.equal(simulateOccupancyChange(0, 100, "EXIT"), 0);
  });
});
