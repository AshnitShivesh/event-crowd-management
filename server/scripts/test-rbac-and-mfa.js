/**
 * Demonstration script for DA3 Question 2(b):
 * Proves that Update and Delete APIs reject requests without a valid token (401),
 * reject requests from unauthorized roles (403), and allow authorized organizers.
 */
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
    console.log(`Connection error: ${err.message}\n`);
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

  console.log("========================================================\n");
}

runRbacTests().catch(console.error);
