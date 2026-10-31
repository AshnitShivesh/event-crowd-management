const { performance } = require("node:perf_hooks");

const args = process.argv.slice(2);
const url = args[0] || process.env.URL || "http://localhost:8080/api/instance-check";
const totalRequests = Number(args[1] || process.env.REQUESTS || 1000);
const concurrency = Number(args[2] || process.env.CONCURRENCY || 20);

async function main() {
  const latencies = [];
  const instanceCounts = {};
  const statusCounts = {};
  let succeeded = 0;
  let failed = 0;
  let nextRequest = 0;

  console.log(`\nStarting load test:`);
  console.log(`  URL:         ${url}`);
  console.log(`  Requests:    ${totalRequests}`);
  console.log(`  Concurrency: ${concurrency}`);

  const start = performance.now();

  async function worker() {
    while (true) {
      const id = nextRequest++;
      if (id >= totalRequests) return;

      const requestStart = performance.now();

      try {
        const response = await fetch(url);
        statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;

        if (!response.ok) {
          failed++;
        } else {
          succeeded++;
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            const inst = data.instance || "unknown";
            instanceCounts[inst] = (instanceCounts[inst] || 0) + 1;
          } catch {
            // Not JSON or plain text
          }
        }
      } catch (err) {
        failed++;
        const errKey = err.code || "NETWORK_ERROR";
        statusCounts[errKey] = (statusCounts[errKey] || 0) + 1;
      } finally {
        latencies.push(performance.now() - requestStart);
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  const durationSeconds = (performance.now() - start) / 1000;
  latencies.sort((a, b) => a - b);

  const averageMs =
    latencies.reduce((sum, value) => sum + value, 0) /
    (latencies.length || 1);

  const p95 = latencies.length ? latencies[Math.ceil(0.95 * latencies.length) - 1] : 0;
  const p99 = latencies.length ? latencies[Math.ceil(0.99 * latencies.length) - 1] : 0;

  console.log("\n==========================================");
  console.log("          LOAD TEST RESULTS");
  console.log("==========================================");
  console.log(`Total requests:         ${totalRequests}`);
  console.log(`Concurrency:            ${concurrency}`);
  console.log(`Successful:             ${succeeded}`);
  console.log(`Failed:                 ${failed}`);
  console.log(`Duration:               ${durationSeconds.toFixed(2)} seconds`);
  console.log(`Requests/sec (Throughput): ${(totalRequests / durationSeconds).toFixed(2)} req/s`);
  console.log(`Average response time:  ${averageMs.toFixed(2)} ms`);
  console.log(`p95 response time:      ${p95.toFixed(2)} ms`);
  console.log(`p99 response time:      ${p99.toFixed(2)} ms`);

  console.log("\n--- HTTP STATUS CODES ---");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count} (${((count / totalRequests) * 100).toFixed(1)}%)`);
  }

  const distinctInstances = Object.keys(instanceCounts);
  if (distinctInstances.length > 0) {
    console.log("\n--- INSTANCE DISTRIBUTION (Question 1a) ---");
    console.log(`Total backend instances responding: ${distinctInstances.length}`);
    for (const [inst, count] of Object.entries(instanceCounts)) {
      console.log(`  Instance [${inst}]: ${count} requests (${((count / succeeded) * 100).toFixed(1)}%)`);
    }
  }
  console.log("==========================================\n");
}

main().catch(console.error);
