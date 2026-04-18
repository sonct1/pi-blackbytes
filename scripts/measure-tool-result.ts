import { processToolResult } from "../src/handlers/tool-result.js";

const N = 100;

// Representative multi-line read payload: 50 lines of code
const sampleCode = Array.from(
  { length: 50 },
  (_, i) =>
    `const value${i} = someFunction(${i}, "arg${i}", { key: "value_${i}" });`
).join("\n");

const payload = {
  toolName: "read",
  isError: false,
  content: [{ type: "text", text: sampleCode }],
};

const config = { hashline_edit: true };

let totalMs = 0;

for (let i = 0; i < N; i++) {
  const start = performance.now();
  processToolResult(payload, config);
  const end = performance.now();
  totalMs += end - start;
}

const average = totalMs / N;

console.log(`processToolResult() benchmark (N=${N})`);
console.log(`  total: ${totalMs.toFixed(3)}ms`);
console.log(`  average: ${average.toFixed(3)}ms`);

if (average >= 50) {
  console.error(`FAIL: average ${average.toFixed(3)}ms >= 50ms budget`);
  process.exit(1);
}

console.log(`PASS: average ${average.toFixed(3)}ms < 50ms budget`);
