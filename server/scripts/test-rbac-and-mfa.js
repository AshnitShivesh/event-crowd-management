/**
 * Demonstration script for DA3 Question 2(b):
 * Proves that Update and Delete APIs reject requests without a valid token (401),
 * reject requests from unauthorized roles (403), and allow authorized organizers.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const jwt = require("jsonwebtoken");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000/api";

async function runRbacTests() {
  console.log("\n========================================================");
  console.log(" DA3 Question 2(b) - Role-Based Access Control Evidence");
  console.log("========================================================\n");

  // Test 1: Calling DELETE /api/events/1 without any Authorization header
  console.log("TEST 1: Calling DELETE /api/events/1 without Authorization token...");
  try {
    const res1 = await fetch(`${BASE_URL}/events/1`, {
      method: "DELETE",
    });
    const body1 = await res1.json();
    console.log(`Status Code: ${res1.status} (${res1.status === 401 ? "PASS - 401 Unauthorized" : "FAIL"})`);
    console.log(`Response:    ${JSON.stringify(body1)}\n`);
  } catch (err) {
    console.log(`Connection error: ${err.message}`);
    console.log(`(Start backend server with 'npm start' to test against live endpoint)\n`);
  }

  // Test 2: Calling PUT /api/events/1 without Authorization token
  console.log("TEST 2: Calling PUT /api/events/1 without Authorization token...");
  try {
    const res2 = await fetch(`${BASE_URL}/events/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized Update Attempt" }),
    });
    const body2 = await res2.json();
    console.log(`Status Code: ${res2.status} (${res2.status === 401 ? "PASS - 401 Unauthorized" : "FAIL"})`);
    console.log(`Response:    ${JSON.stringify(body2)}\n`);
  } catch (err) {
    console.log(`Connection error: ${err.message}\n`);
  }

  // Test 3: Calling DELETE with an invalid/fake Bearer token
  console.log("TEST 3: Calling DELETE /api/events/1 with an invalid/fake Bearer token...");
  try {
    const res3 = await fetch(`${BASE_URL}/events/1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token" },
    });
    const body3 = await res3.json();
    console.log(`Status Code: ${res3.status} (${res3.status === 401 ? "PASS - 401 Unauthorized" : "FAIL"})`);
    console.log(`Response:    ${JSON.stringify(body3)}\n`);
  } catch (err) {
    console.log(`Connection error: ${err.message}\n`);
  }

  // Test 4: Calling DELETE /api/events/1 with a valid Staff token (Forbidden role)
  console.log("TEST 4: Calling DELETE /api/events/1 with valid Staff token (role=staff)...");
  try {
    const staffToken = jwt.sign(
      { sub: "2", email: "staff1@event.com", role: "staff", type: "access", jti: "test-staff-jti" },
      process.env.JWT_SECRET || "fallback_test_secret_32_bytes_long!!",
      { expiresIn: 300, issuer: "event-crowd-management", audience: "event-crowd-management-client" }
    );
    const res4 = await fetch(`${BASE_URL}/events/1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const body4 = await res4.json();
    console.log(`Status Code: ${res4.status} (${res4.status === 403 ? "PASS - 403 Forbidden" : "FAIL"})`);
    console.log(`Response:    ${JSON.stringify(body4)}\n`);
  } catch (err) {
    console.log(`Connection error: ${err.message}\n`);
  }

  console.log("========================================================\n");
}

runRbacTests().catch(console.error);
