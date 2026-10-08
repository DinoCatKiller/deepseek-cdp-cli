import { setTimeout as defaultDelay } from 'node:timers/promises'

export type PageEvaluationDelay = (milliseconds: number) => Promise<void>

export interface RetryPageEvaluationOptions {
  maxAttempts?: number | undefined
  retryDelayMs?: number | undefined
  delay?: PageEvaluationDelay | undefined
}

export const DEFAULT_PAGE_EVALUATION_MAX_ATTEMPTS = 5
export const DEFAULT_PAGE_EVALUATION_RETRY_DELAY_MS = 200

// Puppeteer surfaces an in-flight document navigation as one of these messages.
// The exact wording differs across the browser protocol and puppeteer versions.
const PAGE_NAVIGATION_ERROR_PATTERN =
  /Execution context was destroyed|Cannot find context with specified id|Navigating frame was detached|Target closed|Session closed|Node with given id does not belong to the document/iu

export function isPageNavigationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    PAGE_NAVIGATION_ERROR_PATTERN.test(error.message)
  )
}

// Single-page apps can keep navigating after `domcontentloaded`. An in-flight
// navigation destroys the evaluation context, so a read that only needs the
// settled document must be retried instead of failing the whole command.
export async function retryPageEvaluation<T>(
  evaluateAction: () => Promise<T>,
  options: RetryPageEvaluationOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_PAGE_EVALUATION_MAX_ATTEMPTS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_PAGE_EVALUATION_RETRY_DELAY_MS
  const delay = options.delay ?? defaultDelay
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await evaluateAction()
    } catch (error) {
      lastError = error
      if (!isPageNavigationError(error) || attempt === maxAttempts) {
        throw error
      }
      await delay(retryDelayMs * attempt)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Page evaluation failed.')
}