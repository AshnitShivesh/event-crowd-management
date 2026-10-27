
const { performance } = require("node:perf_hooks");

const url = "http://localhost:8080/api/instance-check";
const totalRequests = 1000;
const concurrency = 20;

async function main() {
  const latencies = [];
  let succeeded = 0;
  let failed = 0;
  let nextRequest = 0;

  const start = performance.now();

  async function worker() {
    while (true) {
      const id = nextRequest++;
      if (id >= totalRequests) return;

      const requestStart = performance.now();

      try {
        const response = await fetch(url);
        await response.arrayBuffer();

        if (!response.ok) {
          failed++;
        } else {
          succeeded++;
        }
      } catch {
        failed++;
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
    latencies.length;

  console.log("\n--- LOAD TEST RESULTS ---");
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Successful: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${durationSeconds.toFixed(2)} seconds`);
  console.log(`Requests/sec: ${(totalRequests / durationSeconds).toFixed(2)}`);
  console.log(`Average response time: ${averageMs.toFixed(2)} ms`);
  console.log(`p95 response time: ${latencies[Math.ceil(0.95 * latencies.length) - 1].toFixed(2)} ms`);
}

main().catch(console.error);
