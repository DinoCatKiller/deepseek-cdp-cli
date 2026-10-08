import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from 'puppeteer-core'
import { ensureDeepSeekComposerMode } from '../src/infrastructure/deepseek/deepSeekComposerMode.js'
import type { RuntimeLogger } from '../src/shared/logging/runtimeLogger.js'

interface FakePageInput {
  modeSelectorVisible: boolean
  activeMode: 'instant' | 'expert' | 'vision' | null
  deepThinkState: string
  searchState: string
}

interface CapturedLog {
  message: string
  context: Record<string, unknown> | undefined
}

// DeepSeek replaced the Instant/Expert/Vision selector with DeepThink/Search
// toggles, so a home surface can legitimately expose no mode selector at all.
function createFakePage(input: FakePageInput): Page {
  const composerSnapshot = {
    pageUrl: 'https://chat.deepseek.com/',
    routeKind: 'home',
    agentId: null,
    sessionId: null,
    composerInput: {
      found: true,
      selector: 'textarea:not([disabled])',
      label: '给 DeepSeek 发送消息',
    },
    sendOrStopButton: { found: true, selector: '[role="button"]', label: null, state: 'send' },
    deepThinkToggle: {
      found: true,
      selector: '[aria-pressed]',
      label: '深度思考',
      state: input.deepThinkState,
    },
    searchToggle: {
      found: true,
      selector: '[aria-pressed]',
      label: '智能搜索',
      state: input.searchState,
    },
    fileButton: { found: true, selector: '[role="button"]', label: null },
  }
  const modeSurface = {
    heading: null,
    modeSelectorVisible: input.modeSelectorVisible,
    availableModes: input.modeSelectorVisible ? ['instant', 'expert', 'vision'] : [],
    activeMode: input.activeMode,
  }

  return {
    url: () => 'https://chat.deepseek.com/',
    evaluate: (first: unknown) =>
      Promise.resolve(typeof first === 'function' ? composerSnapshot : modeSurface),
    evaluateHandle: () =>
      Promise.resolve({ asElement: () => null, dispose: () => Promise.resolve() }),
  } as unknown as Page
}

function createLogger(logs: CapturedLog[]): RuntimeLogger {
  return {
    info: (message: string, context?: Record<string, unknown>) => {
      logs.push({ message, context })
    },
    debug: () => undefined,
    error: () => undefined,
  } as unknown as RuntimeLogger
}

const FAST_BUDGET = {
  timeoutMs: 1_500,
  pollIntervalMs: 1,
  stableWindowMs: 1,
} as const

void test('keeps the current mode instead of failing when no mode selector exists', async () => {
  const logs: CapturedLog[] = []
  const page = createFakePage({
    modeSelectorVisible: false,
    activeMode: null,
    deepThinkState: 'on',
    searchState: 'off',
  })

  const result = await ensureDeepSeekComposerMode(
    page,
    {
      requestedMode: { chatMode: 'expert', deepThink: 'on', search: 'off' },
      ...FAST_BUDGET,
    },
    createLogger(logs),
  )

  assert.equal(result.requestedMode.chatMode, 'expert')
  assert.equal(result.settledSnapshot.deepThinkToggle.state, 'on')
  const skipLog = logs.find(log => /no mode selector is available/.test(log.message))
  assert.ok(skipLog, 'expected the selector-unavailable skip to be logged')
  assert.equal(skipLog?.context?.['requestedChatMode'], 'expert')
  assert.equal(skipLog?.context?.['routeKind'], 'home')
  assert.deepEqual(skipLog?.context?.['availableModes'], [])
  assert.match(String(skipLog?.context?.['hint']), /--deep-think/)
})

void test('does not emit the selector-unavailable skip when the selector exists', async () => {
  const logs: CapturedLog[] = []
  const page = createFakePage({
    modeSelectorVisible: true,
    activeMode: 'expert',
    deepThinkState: 'on',
    searchState: 'off',
  })

  await ensureDeepSeekComposerMode(
    page,
    {
      requestedMode: { chatMode: 'expert', deepThink: 'on', search: 'off' },
      ...FAST_BUDGET,
    },
    createLogger(logs),
  )

  assert.equal(
    logs.some(log => /no mode selector is available/.test(log.message)),
    false,
  )
})

void test('still fails closed when a visible selector refuses the requested mode', async () => {
  const page = createFakePage({
    modeSelectorVisible: true,
    activeMode: null,
    deepThinkState: 'on',
    searchState: 'off',
  })

  await assert.rejects(
    ensureDeepSeekComposerMode(
      page,
      {
        requestedMode: { chatMode: 'expert', deepThink: 'on', search: 'off' },
        timeoutMs: 600,
        pollIntervalMs: 1,
        stableWindowMs: 1,
      },
      createLogger([]),
    ),
    /Timed out selecting DeepSeek expert mode/,
  )
})