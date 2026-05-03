import { createLogger } from './logger.js'

const log = createLogger('retry')

interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  retryOn?: (err: unknown) => boolean
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('socket hang up')) {
      return true
    }
    // OpenRouter / OpenAI SDK rate limit messages
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return true
    }
  }
  // OpenAI SDK errors (.status directly on the error object)
  const directStatus = (err as any)?.status
  if (typeof directStatus === 'number') {
    return directStatus === 429 || (directStatus >= 500 && directStatus < 600)
  }
  // Axios-style errors with response status
  const responseStatus = (err as any)?.response?.status
  if (typeof responseStatus === 'number') {
    return responseStatus === 429 || (responseStatus >= 500 && responseStatus < 600)
  }
  // Network errors (no response)
  if ((err as any)?.code === 'ECONNABORTED' || (err as any)?.code === 'ETIMEDOUT') {
    return true
  }
  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, retryOn = isRetryableError } = options

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= retries || !retryOn(err)) {
        throw err
      }
      const delay = baseDelayMs * Math.pow(2, attempt)
      log.debug({ attempt: attempt + 1, retries, delayMs: delay, err }, 'retrying after error')
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
