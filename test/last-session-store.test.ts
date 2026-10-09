import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileSystemLastSessionStore } from '../src/infrastructure/preferences/fileSystemLastSessionStore.js'
import {
  resolveCliReplySessionPlan,
  runCliReplyAndRememberSession,
} from '../src/application/services/cliReplyErgonomics.js'

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z')

async function withStore(
  run: (input: {
    store: FileSystemLastSessionStore
    configDir: string
    filePath: string
  }) => Promise<void>,
): Promise<void> {
  const configDir = await mkdtemp(join(tmpdir(), 'deepseek-last-session-'))
  try {
    const store = new FileSystemLastSessionStore({
      configDir,
      now: () => FIXED_NOW,
    })
    await run({
      store,
      configDir,
      filePath: join(configDir, 'last-session.json'),
    })
  } finally {
    await rm(configDir, { recursive: true, force: true })
  }
}

void test('records the session file path alongside the session id', async () => {
  await withStore(async ({ store }) => {
    await store.save('session-1', '/proj/.deepseek-cdp-cli/sessions/session-1.json')

    assert.deepEqual(await store.load(), {
      schemaVersion: 1,
      sessionId: 'session-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      sessionFilePath: '/proj/.deepseek-cdp-cli/sessions/session-1.json',
    })
  })
})

void test('omits the session file path when it is not provided', async () => {
  await withStore(async ({ store, filePath }) => {
    await store.save('session-2')

    const raw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
    assert.equal(Object.keys(raw).length, 3)
    assert.equal(raw['sessionFilePath'], undefined)
  })
})

void test('still reads pointers written before the path field existed', async () => {
  await withStore(async ({ store, filePath }) => {
    await writeFile(filePath, `${JSON.stringify({
      schemaVersion: 1,
      sessionId: 'legacy-session',
      updatedAt: '2025-05-05T05:05:05.000Z',
    }, null, 2)}\n`, 'utf8')

    assert.deepEqual(await store.load(), {
      schemaVersion: 1,
      sessionId: 'legacy-session',
      updatedAt: '2025-05-05T05:05:05.000Z',
    })
  })
})

void test('rejects a pointer that carries unknown fields', async () => {
  await withStore(async ({ store, filePath }) => {
    await writeFile(filePath, `${JSON.stringify({
      schemaVersion: 1,
      sessionId: 'session-3',
      updatedAt: '2026-01-01T00:00:00.000Z',
      unexpected: true,
    })}\n`, 'utf8')

    await assert.rejects(store.load(), /fields are invalid/u)
  })
})

void test('rejects a non-string session file path', async () => {
  await withStore(async ({ store, filePath }) => {
    await writeFile(filePath, `${JSON.stringify({
      schemaVersion: 1,
      sessionId: 'session-4',
      updatedAt: '2026-01-01T00:00:00.000Z',
      sessionFilePath: 42,
    })}\n`, 'utf8')

    await assert.rejects(store.load(), /sessionFilePath must be a non-empty string/u)
  })
})

void test('carries the recorded path into the last-session reply plan', () => {
  assert.deepEqual(
    resolveCliReplySessionPlan({
      lastSessionId: 'session-5',
      lastSessionFilePath: '/proj/.deepseek-cdp-cli/sessions/session-5.json',
    }),
    {
      source: 'last-session',
      sessionId: 'session-5',
      sessionFilePath: '/proj/.deepseek-cdp-cli/sessions/session-5.json',
    },
  )
})

void test('keeps the plan shape unchanged for path-less pointers', () => {
  assert.deepEqual(
    resolveCliReplySessionPlan({ lastSessionId: 'session-6' }),
    { source: 'last-session', sessionId: 'session-6' },
  )
})

void test('explains the per-directory layout when a recorded pointer path fails', async () => {
  await assert.rejects(
    runCliReplyAndRememberSession({
      plan: {
        source: 'last-session',
        sessionId: 'session-7',
        sessionFilePath: '/gone/.deepseek-cdp-cli/sessions/session-7.json',
      },
      lastSessionStore: { save: () => Promise.resolve() },
      validateLastSession: () =>
        Promise.reject(new Error('ENOENT: no such file or directory')),
      execute: () => Promise.resolve({ sessionId: 'session-7' }),
    }),
    (error: Error) => {
      assert.match(error.message, /records its session file at "\/gone\/\.deepseek-cdp-cli\/sessions\/session-7\.json"/u)
      assert.match(error.message, /stored per working directory/u)
      assert.match(error.message, /ENOENT/u)
      return true
    },
  )
})

void test('remembers the session file returned by the reply execution', async () => {
  const saved: Array<[string, string | undefined]> = []

  await runCliReplyAndRememberSession({
    plan: { source: 'new-session' },
    lastSessionStore: {
      save: (sessionId, sessionFilePath) => {
        saved.push([sessionId, sessionFilePath])
        return Promise.resolve()
      },
    },
    execute: () => Promise.resolve({
      sessionId: 'session-8',
      sessionFile: '/proj/.deepseek-cdp-cli/sessions/session-8.json',
    }),
  })

  assert.deepEqual(saved, [
    ['session-8', '/proj/.deepseek-cdp-cli/sessions/session-8.json'],
  ])
})

void test('validates the last-session pointer with the recorded path', async () => {
  const seen: Array<{ sessionId: string; sessionFilePath?: string | undefined }> = []

  await runCliReplyAndRememberSession({
    plan: {
      source: 'last-session',
      sessionId: 'session-9',
      sessionFilePath: '/proj/.deepseek-cdp-cli/sessions/session-9.json',
    },
    lastSessionStore: { save: () => Promise.resolve() },
    validateLastSession: target => {
      seen.push(target)
      return Promise.resolve()
    },
    execute: () => Promise.resolve({ sessionId: 'session-9' }),
  })

  assert.deepEqual(seen, [
    {
      sessionId: 'session-9',
      sessionFilePath: '/proj/.deepseek-cdp-cli/sessions/session-9.json',
    },
  ])
})