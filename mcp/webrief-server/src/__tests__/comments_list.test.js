/**
 * comments_list.test.js — Unit tests for the comments_list read-only tool.
 *
 * Covers:
 *   - inputSchema (required projectId UUID validation)
 *   - handler success paths (threading + reply nesting + ordering, name
 *     resolution with no emails in output, sectionId filter, pageId /
 *     includeResolved query params, deleted-root-without-replies omitted,
 *     commentsAvailable:false)
 *   - handler error paths (404 -> project_not_found, 401/403 ->
 *     backend_unauthorized, 500 -> backend_error, missing token ->
 *     mcp_token_missing)
 *
 * Run with: node src/__tests__/comments_list.test.js
 */

import assert from 'node:assert/strict';

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
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    failed++;
  }
}

function assertStructuredError(result, code) {
  assert.equal(result.status, 'error', "status should be 'error'");
  assert.ok(result.error, 'result.error should be present');
  assert.equal(result.error.code, code, `error.code should be '${code}'`);
}

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-comments-list';
process.env.WEBRIEF_MCP_TOKEN = TEST_MCP_TOKEN;

function makeFetchResponse({ ok = true, status = 200, statusText = 'OK', body = null }) {
  return {
    ok,
    status,
    statusText,
    async json() {
      return body;
    },
  };
}

async function withMockedFetch(routes, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    calls.push({ url: u, method: options?.method ?? 'GET', options });
    const key = `${options?.method ?? 'GET'} ${u}`;
    const spec = routes[key] ?? routes[u];
    if (!spec) throw new Error(`No mock configured for: ${key}`);
    return makeFetchResponse(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

import * as commentsList from '../tools/comments_list.js';

const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
const PAGE_ID = '66666666-6666-6666-6666-666666666666';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function commentsRoute(url, body) {
  return { [`${BACKEND_BASE}${url}`]: { body } };
}

console.log('\ncomments_list — inputSchema');

await test('accepts valid { projectId }', () => {
  const result = commentsList.inputSchema.safeParse({ projectId: PROJECT_ID });
  assert.ok(result.success);
});

await test('rejects missing projectId', () => {
  const result = commentsList.inputSchema.safeParse({});
  assert.ok(!result.success);
});

await test('rejects non-UUID projectId', () => {
  const result = commentsList.inputSchema.safeParse({ projectId: 'not-a-uuid' });
  assert.ok(!result.success);
});

await test('defaults includeResolved to false', () => {
  const result = commentsList.inputSchema.safeParse({ projectId: PROJECT_ID });
  assert.equal(result.data.includeResolved, false);
});

console.log('\ncomments_list — handler success paths');

await test('groups roots + replies into threads, sorted oldest-first, with name resolution and no emails', async () => {
  const comments = [
    {
      id: 'root-2',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      sectionId: 's2',
      parentCommentId: null,
      anchorSnippet: null,
      mentions: [],
      actorUserId: USER_A,
      authorName: 'Fallback A',
      authorEmail: 'a@example.com',
      body: 'Second root (created later)',
      source: 'app',
      status: 'open',
      resolvedAt: null,
      resolvedByUserId: null,
      editedAt: null,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
    {
      id: 'root-1',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      sectionId: 's1',
      parentCommentId: null,
      anchorSnippet: 'texto ancla',
      mentions: [USER_B],
      actorUserId: USER_A,
      authorName: 'Fallback A',
      authorEmail: 'a@example.com',
      body: 'First root (created earlier)',
      source: 'app',
      status: 'open',
      resolvedAt: null,
      resolvedByUserId: null,
      editedAt: null,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'reply-1-b',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      sectionId: 's1',
      parentCommentId: 'root-1',
      anchorSnippet: null,
      mentions: [],
      actorUserId: USER_B,
      authorName: 'Fallback B',
      authorEmail: 'b@example.com',
      body: 'Second reply (later)',
      source: 'app',
      status: 'open',
      resolvedAt: null,
      resolvedByUserId: null,
      editedAt: '2026-09-01T02:00:00.000Z',
      deletedAt: null,
      deletedByUserId: null,
      createdAt: '2026-09-01T02:00:00.000Z',
      updatedAt: '2026-09-01T02:00:00.000Z',
    },
    {
      id: 'reply-1-a',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      sectionId: 's1',
      parentCommentId: 'root-1',
      anchorSnippet: null,
      mentions: [],
      actorUserId: USER_B,
      authorName: 'Fallback B',
      authorEmail: 'b@example.com',
      body: 'First reply (earlier)',
      source: 'app',
      status: 'open',
      resolvedAt: null,
      resolvedByUserId: null,
      editedAt: null,
      deletedAt: null,
      deletedByUserId: null,
      createdAt: '2026-09-01T01:00:00.000Z',
      updatedAt: '2026-09-01T01:00:00.000Z',
    },
  ];

  const profiles = [
    { id: USER_A, email: 'a@example.com', fullName: 'Ana Autora', avatarUrl: null },
    { id: USER_B, email: 'b@example.com', fullName: null, avatarUrl: null },
  ];

  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments,
    profiles,
    members: [],
    commentsAvailable: true,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });

    assert.equal(r.status, 'ok');
    assert.equal(r.tool, commentsList.name);
    assert.equal(r.commentsAvailable, true);
    assert.equal(r.totalThreads, 2);
    assert.equal(r.totalComments, 4);

    // Roots sorted oldest first: root-1 (09-01) before root-2 (09-02).
    assert.equal(r.threads[0].id, 'root-1');
    assert.equal(r.threads[1].id, 'root-2');

    const thread1 = r.threads[0];
    assert.equal(thread1.sectionId, 's1');
    assert.equal(thread1.anchorSnippet, 'texto ancla');
    assert.equal(thread1.resolved, false);
    assert.equal(thread1.deleted, false);
    // fullName resolved from profile, not the stored authorName fallback.
    assert.equal(thread1.author.name, 'Ana Autora');
    assert.equal(thread1.mentions.length, 1);
    assert.equal(thread1.mentions[0].id, USER_B);
    // USER_B has no fullName -> falls back to email.
    assert.equal(thread1.mentions[0].name, 'b@example.com');

    // Replies sorted oldest first.
    assert.equal(thread1.replies.length, 2);
    assert.equal(thread1.replies[0].id, 'reply-1-a');
    assert.equal(thread1.replies[1].id, 'reply-1-b');
    assert.equal(thread1.replies[1].editedAt, '2026-09-01T02:00:00.000Z');

    // No raw email address anywhere in the output (b@example.com is only
    // ever used as a resolved NAME fallback, never as an email field).
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes('a@example.com'), 'author email must not leak into output');
    // Precise check: author objects only ever carry id/name.
    for (const thread of r.threads) {
      assert.deepEqual(Object.keys(thread.author).sort(), ['id', 'name']);
      assert.ok(!('authorEmail' in thread));
      assert.ok(!('email' in thread));
    }
  });
});

await test('sectionId filters by ROOT sectionId only (replies follow their root)', async () => {
  const comments = [
    {
      id: 'root-1', pageId: PAGE_ID, sectionId: 's1', parentCommentId: null,
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'root in s1', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      // Reply has a DIFFERENT sectionId than its root (edge case) — must still
      // follow the root's thread and not affect the sectionId filter.
      id: 'reply-1', pageId: PAGE_ID, sectionId: 's2', parentCommentId: 'root-1',
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'reply', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z',
    },
    {
      id: 'root-2', pageId: PAGE_ID, sectionId: 's2', parentCommentId: null,
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'root in s2', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z',
    },
  ];

  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments, profiles: [], members: [], commentsAvailable: true,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID, sectionId: 's1' });
    assert.equal(r.totalThreads, 1);
    assert.equal(r.threads[0].id, 'root-1');
    assert.equal(r.threads[0].replies.length, 1);
    assert.equal(r.threads[0].replies[0].id, 'reply-1');
  });
});

await test('builds query string with pageId and includeResolved', async () => {
  const routes = commentsRoute(
    `/projects/${PROJECT_ID}/comments?pageId=${encodeURIComponent(PAGE_ID)}&includeResolved=true`,
    { comments: [], profiles: [], members: [], commentsAvailable: true }
  );

  await withMockedFetch(routes, async (calls) => {
    const r = await commentsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID, includeResolved: true });
    assert.equal(r.status, 'ok');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(`pageId=${PAGE_ID}`));
    assert.ok(calls[0].url.includes('includeResolved=true'));
  });
});

await test('omits pageId/includeResolved from the query string when not provided', async () => {
  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments: [], profiles: [], members: [], commentsAvailable: true,
  });

  await withMockedFetch(routes, async (calls) => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.status, 'ok');
    assert.equal(calls[0].url, `${BACKEND_BASE}/projects/${PROJECT_ID}/comments`);
  });
});

await test('deleted root WITHOUT surviving replies is omitted', async () => {
  const comments = [
    {
      id: 'root-1', pageId: PAGE_ID, sectionId: 's1', parentCommentId: null,
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: '', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: '2026-09-01T03:00:00.000Z', deletedByUserId: USER_A,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T03:00:00.000Z',
    },
  ];
  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments, profiles: [], members: [], commentsAvailable: true,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.totalThreads, 0);
    assert.deepEqual(r.threads, []);
  });
});

await test('deleted root WITH a surviving non-deleted reply is kept, body empty + deleted:true', async () => {
  const comments = [
    {
      id: 'root-1', pageId: PAGE_ID, sectionId: 's1', parentCommentId: null,
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: '', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: '2026-09-01T03:00:00.000Z', deletedByUserId: USER_A,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T03:00:00.000Z',
    },
    {
      id: 'reply-1', pageId: PAGE_ID, sectionId: 's1', parentCommentId: 'root-1',
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'still here', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z',
    },
  ];
  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments, profiles: [], members: [], commentsAvailable: true,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.totalThreads, 1);
    assert.equal(r.threads[0].deleted, true);
    assert.equal(r.threads[0].body, '');
    assert.equal(r.threads[0].replies.length, 1);
    assert.equal(r.threads[0].replies[0].deleted, false);
  });
});

await test('orphan replies (missing root) are dropped', async () => {
  const comments = [
    {
      id: 'reply-orphan', pageId: PAGE_ID, sectionId: 's1', parentCommentId: 'ghost-root',
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'orphan', status: 'open', resolvedAt: null, resolvedByUserId: null,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];
  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments, profiles: [], members: [], commentsAvailable: true,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.totalThreads, 0);
    assert.equal(r.totalComments, 0);
  });
});

await test('resolved root includes resolvedBy name resolution', async () => {
  const comments = [
    {
      id: 'root-1', pageId: PAGE_ID, sectionId: 's1', parentCommentId: null,
      mentions: [], actorUserId: USER_A, authorName: 'A', authorEmail: 'a@x.com',
      body: 'resolved thread', status: 'resolved',
      resolvedAt: '2026-09-01T05:00:00.000Z', resolvedByUserId: USER_B,
      editedAt: null, deletedAt: null, deletedByUserId: null,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T05:00:00.000Z',
    },
  ];
  const profiles = [{ id: USER_B, email: 'b@x.com', fullName: 'Beto', avatarUrl: null }];
  const routes = commentsRoute(
    `/projects/${PROJECT_ID}/comments?includeResolved=true`,
    { comments, profiles, members: [], commentsAvailable: true }
  );

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID, includeResolved: true });
    assert.equal(r.threads[0].resolved, true);
    assert.deepEqual(r.threads[0].resolvedBy, { id: USER_B, name: 'Beto' });
  });
});

await test('returns commentsAvailable:false with empty threads when the backend reports it unavailable', async () => {
  const routes = commentsRoute(`/projects/${PROJECT_ID}/comments`, {
    comments: [], profiles: [], commentsAvailable: false,
  });

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.status, 'ok');
    assert.equal(r.commentsAvailable, false);
    assert.deepEqual(r.threads, []);
    assert.equal(r.totalThreads, 0);
    assert.equal(r.totalComments, 0);
  });
});

console.log('\ncomments_list — handler error paths');

await test('maps backend 404 to project_not_found', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/comments`]: {
      ok: false,
      status: 404,
      body: { error: 'Proyecto no encontrado' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'project_not_found');
    assert.equal(r.error.backendStatus, 404);
  });
});

await test('maps backend 401 to backend_unauthorized', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/comments`]: {
      ok: false,
      status: 401,
      body: { error: 'Token MCP invalido o revocado' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'backend_unauthorized');
  });
});

await test('maps backend 403 to backend_unauthorized', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/comments`]: {
      ok: false,
      status: 403,
      body: { error: 'No tienes acceso a este proyecto' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'backend_unauthorized');
  });
});

await test('maps backend 500 to backend_error with backendStatus', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/comments`]: {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: { error: 'boom' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'backend_error');
    assert.equal(r.error.backendStatus, 500);
  });
});

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await commentsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

console.log(`\ncomments_list.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
