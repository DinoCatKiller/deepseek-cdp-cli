import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPageNavigationError,
  retryPageEvaluation,
} from '../src/shared/runtime/retryPageEvaluation.js'

const noDelay = (): Promise<void> => Promise.resolve()

void test('isPageNavigationError recognises an in-flight navigation error', () => {
  assert.equal(
    isPageNavigationError(new Error('Execution context was destroyed, most likely because of a navigation.')),
    true,
  )
  assert.equal(
    isPageNavigationError(new Error('Cannot find context with specified id')),
    true,
  )
  assert.equal(isPageNavigationError(new Error('Navigating frame was detached')), true)
  assert.equal(isPageNavigationError(new Error('net::ERR_NAME_NOT_RESOLVED')), false)
  assert.equal(isPageNavigationError('Execution context was destroyed'), false)
})

void test('retryPageEvaluation returns the first successful result without retrying', async () => {
  let attempts = 0

  const result = await retryPageEvaluation(() => {
    attempts += 1
    return Promise.resolve('settled')
  }, { delay: noDelay })

  assert.equal(result, 'settled')
  assert.equal(attempts, 1)
})

void test('retryPageEvaluation recovers after the navigation settles', async () => {
  let attempts = 0

  const result = await retryPageEvaluation(() => {
    attempts += 1
    if (attempts < 3) {
      return Promise.reject(new Error('Execution context was destroyed, most likely because of a navigation.'))
    }
    return Promise.resolve(['deepseek:token'])
  }, { delay: noDelay })

  assert.deepEqual(result, ['deepseek:token'])
  assert.equal(attempts, 3)
})

void test('retryPageEvaluation backs off linearly between attempts', async () => {
  const delays: number[] = []
  let attempts = 0

  await retryPageEvaluation(() => {
    attempts += 1
    if (attempts < 4) {
      return Promise.reject(new Error('Navigating frame was detached'))
    }
    return Promise.resolve('ok')
  }, {
    retryDelayMs: 50,
    delay: milliseconds => {
      delays.push(milliseconds)
      return Promise.resolve()
    },
  })

  assert.deepEqual(delays, [50, 100, 150])
})

void test('retryPageEvaluation stops at maxAttempts and rethrows the navigation error', async () => {
  let attempts = 0

  await assert.rejects(
    retryPageEvaluation(() => {
      attempts += 1
      return Promise.reject(new Error('Execution context was destroyed'))
    }, { maxAttempts: 3, delay: noDelay }),
    /Execution context was destroyed/,
  )

  assert.equal(attempts, 3)
})

void test('retryPageEvaluation fails fast on a non-navigation error', async () => {
  let attempts = 0

  await assert.rejects(
    retryPageEvaluation(() => {
      attempts += 1
      return Promise.reject(new Error('localStorage is unavailable'))
    }, { delay: noDelay }),
    /localStorage is unavailable/,
  )

  assert.equal(attempts, 1)
})