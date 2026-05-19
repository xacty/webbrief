/**
 * fase1.test.js — Unit tests for Fase 1 read-only MCP tool handlers.
 *
 * Tests run WITHOUT a live backend. Verifies:
 *   1. Input schema validation (accept / reject expected inputs)
 *   2. module-level session state (companies.selectActive)
 *   3. Missing-token error path (handlers return structured error, not throw)
 *
 * Run with: node src/__tests__/fase1.test.js
 */

import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

function assertStructuredError(result, code) {
  assert.equal(result.status, 'error', `status should be 'error'`);
  assert.ok(result.error, 'result.error should be present');
  assert.equal(result.error.code, code, `error.code should be '${code}'`);
  assert.ok(typeof result.error.message === 'string', 'error.message should be a string');
}

// ──────────────────────────────────────────────────────────────────────────────
// Session state module tests
// ──────────────────────────────────────────────────────────────────────────────

import {
  getActiveCompanyId,
  setActiveCompanyId,
  clearActiveCompanyId,
} from '../session/activeCompany.js';

console.log('\nsession/activeCompany.js');

await test('initial value is null', () => {
  clearActiveCompanyId();
  assert.equal(getActiveCompanyId(), null);
});

await test('setActiveCompanyId stores the value', () => {
  setActiveCompanyId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(getActiveCompanyId(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});

await test('clearActiveCompanyId resets to null', () => {
  setActiveCompanyId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  clearActiveCompanyId();
  assert.equal(getActiveCompanyId(), null);
});

// ──────────────────────────────────────────────────────────────────────────────
// mcpToken.js — checkMcpToken helper
// ──────────────────────────────────────────────────────────────────────────────

import { checkMcpToken } from '../auth/mcpToken.js';

console.log('\nauth/mcpToken.js — checkMcpToken');

await test('returns null when token is set', () => {
  const original = process.env.WEBRIEF_MCP_TOKEN;
  process.env.WEBRIEF_MCP_TOKEN = 'mcpt_test_token';
  const result = checkMcpToken('test.tool');
  process.env.WEBRIEF_MCP_TOKEN = original;
  assert.equal(result, null);
});

await test('returns structured error when token is missing', () => {
  const original = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  const result = checkMcpToken('test.tool');
  process.env.WEBRIEF_MCP_TOKEN = original;
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, 'test.tool');
});

// ──────────────────────────────────────────────────────────────────────────────
// Input schema validation tests
// ──────────────────────────────────────────────────────────────────────────────

import * as sessionGetContext from '../tools/session.getContext.js';
import * as companiesSelectActive from '../tools/companies.selectActive.js';
import * as projectsGet from '../tools/projects.get.js';
import * as pagesGet from '../tools/pages.get.js';

const VALID_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

console.log('\nsession.getContext — inputSchema');

await test('accepts empty object', () => {
  const result = sessionGetContext.inputSchema.safeParse({});
  assert.ok(result.success, 'should accept empty input');
});

await test('accepts object with extra keys (stripped by zod)', () => {
  const result = sessionGetContext.inputSchema.safeParse({ extra: 'ignored' });
  assert.ok(result.success);
});

console.log('\ncompanies.selectActive — inputSchema');

await test('accepts valid UUID companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({ companyId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({});
  assert.ok(!result.success, 'should reject missing companyId');
});

await test('rejects non-UUID companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({ companyId: 'not-a-uuid' });
  assert.ok(!result.success, 'should reject non-UUID companyId');
});

console.log('\nprojects.get — inputSchema');

await test('accepts valid UUID projectId', () => {
  const result = projectsGet.inputSchema.safeParse({ projectId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing projectId', () => {
  const result = projectsGet.inputSchema.safeParse({});
  assert.ok(!result.success);
});

await test('rejects non-UUID projectId', () => {
  const result = projectsGet.inputSchema.safeParse({ projectId: 'bad' });
  assert.ok(!result.success);
});

console.log('\npages.get — inputSchema');

await test('accepts valid projectId + pageId', () => {
  const result = pagesGet.inputSchema.safeParse({ projectId: VALID_UUID, pageId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing pageId', () => {
  const result = pagesGet.inputSchema.safeParse({ projectId: VALID_UUID });
  assert.ok(!result.success);
});

await test('rejects missing projectId', () => {
  const result = pagesGet.inputSchema.safeParse({ pageId: VALID_UUID });
  assert.ok(!result.success);
});

// ──────────────────────────────────────────────────────────────────────────────
// Missing-token handler path — handlers must return structured error, not throw
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nHandlers — mcp_token_missing error path (no backend call)');

const saved = process.env.WEBRIEF_MCP_TOKEN;
delete process.env.WEBRIEF_MCP_TOKEN;

await test('session.getContext returns mcp_token_missing', async () => {
  const result = await sessionGetContext.handler({});
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, sessionGetContext.name);
});

await test('companies.selectActive returns mcp_token_missing', async () => {
  const result = await companiesSelectActive.handler({ companyId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, companiesSelectActive.name);
});

await test('projects.get returns mcp_token_missing', async () => {
  const result = await projectsGet.handler({ projectId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, projectsGet.name);
});

await test('pages.get returns mcp_token_missing', async () => {
  const result = await pagesGet.handler({ projectId: VALID_UUID, pageId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, pagesGet.name);
});

if (saved !== undefined) process.env.WEBRIEF_MCP_TOKEN = saved;

// ──────────────────────────────────────────────────────────────────────────────
// companies.selectActive — session state mutation
// ──────────────────────────────────────────────────────────────────────────────

console.log('\ncompanies.selectActive — session state (mock-free path, token missing)');

await test('handler does not mutate state when token is missing', async () => {
  clearActiveCompanyId();
  delete process.env.WEBRIEF_MCP_TOKEN;
  await companiesSelectActive.handler({ companyId: VALID_UUID });
  assert.equal(getActiveCompanyId(), null, 'state should not change when token is missing');
  if (saved !== undefined) process.env.WEBRIEF_MCP_TOKEN = saved;
});

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
