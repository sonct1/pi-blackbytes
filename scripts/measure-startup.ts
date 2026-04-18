import { createMockPi } from "../src/test-utils/pi-mock.js";
import { bootstrap } from "../src/bootstrap.js";
import { _resetEnabledSet } from "../src/config/enabled-set.js";

const N = 50;
const times: number[] = [];

for (let i = 0; i < N; i++) {
  _resetEnabledSet();
  const mockPi = createMockPi();
  const start = performance.now();
  bootstrap(mockPi);
  const end = performance.now();
  times.push(end - start);
}

times.sort((a, b) => a - b);

const p50 = times[Math.floor(N * 0.5)];
const p95 = times[Math.floor(N * 0.95)];
const max = times[N - 1];

console.log(`bootstrap() benchmark (N=${N})`);
console.log(`  p50: ${p50.toFixed(3)}ms`);
console.log(`  p95: ${p95.toFixed(3)}ms`);
console.log(`  max: ${max.toFixed(3)}ms`);

if (p95 >= 200) {
  console.error(`FAIL: p95 ${p95.toFixed(3)}ms >= 200ms budget`);
  process.exit(1);
}

console.log(`PASS: p95 ${p95.toFixed(3)}ms < 200ms budget`);
