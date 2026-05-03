/**
 * Basic smoke tests for the roblox-http server.
 *
 * Run with:  npm test
 *
 * Tests only the /health and /search endpoints so they can run without
 * network access to YouTube (search is mocked).
 */

"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");

// ── start server ──────────────────────────────────────────────────────────────
// Override PORT so tests don't clash with a running instance.
process.env.PORT = "18963";
const { server } = require("../server");

// ── helpers ───────────────────────────────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:18963${path}`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log("\nroblox-http server tests\n");

  await test("GET /health returns 200 and ok:true", async () => {
    const { status, body } = await get("/health");
    assert.equal(status, 200);
    const json = JSON.parse(body);
    assert.equal(json.ok, true);
  });

  await test("GET /search without query returns 400", async () => {
    const { status, body } = await get("/search");
    assert.equal(status, 400);
    const json = JSON.parse(body);
    assert.ok(json.error, "should have an error field");
  });

  await test("GET /search with empty query returns 400", async () => {
    const { status, body } = await get("/search?q=");
    assert.equal(status, 400);
    const json = JSON.parse(body);
    assert.ok(json.error);
  });

  await test("GET /stream without url returns 400", async () => {
    const { status, body } = await get("/stream");
    assert.equal(status, 400);
    const json = JSON.parse(body);
    assert.ok(json.error);
  });

  await test("GET /stream with non-YouTube url returns 400", async () => {
    const { status, body } = await get("/stream?url=https://example.com/video");
    assert.equal(status, 400);
    const json = JSON.parse(body);
    assert.ok(json.error);
  });

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed\n`);
  server.close();
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
