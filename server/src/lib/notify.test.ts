import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAxiosPost = vi.fn()
vi.mock('axios', () => ({
  default: { post: mockAxiosPost },
}))

const mockSendTransactional = vi.fn()
vi.mock('../services/brevo.js', () => ({
  sendTransactional: mockSendTransactional,
}))

const mockConfig = {
  alerts: { failureEmail: 'alertas@test.cl', throttleHours: 6 },
}
vi.mock('../config.js', () => ({ config: mockConfig }))

const { notifyJobFailure } = await import('./notify.js')

describe('notifyJobFailure — webhook', () => {
  const originalEnv = process.env.WEBHOOK_URL

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WEBHOOK_URL
    mockConfig.alerts.failureEmail = 'alertas@test.cl'
    mockConfig.alerts.throttleHours = 6
    mockSendTransactional.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WEBHOOK_URL = originalEnv
    } else {
      delete process.env.WEBHOOK_URL
    }
  })

  it('does not POST when WEBHOOK_URL is not set', async () => {
    await notifyJobFailure('wh_unset_job', 'connection timeout')
    expect(mockAxiosPost).not.toHaveBeenCalled()
  })

  it('sends POST to WEBHOOK_URL with job failure details', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example.com/webhook'
    mockAxiosPost.mockResolvedValue({ status: 200 })

    await notifyJobFailure('wh_details_job', 'connection timeout')

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://hooks.example.com/webhook',
      expect.objectContaining({
        content: 'Job **wh_details_job** failed: connection timeout',
        text: 'Job "wh_details_job" failed: connection timeout',
        jobName: 'wh_details_job',
        error: 'connection timeout',
        timestamp: expect.any(String),
      }),
      { timeout: 5000, maxContentLength: 1 * 1024 * 1024 },
    )
  })

  it('does not throw when webhook request fails', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example.com/webhook'
    mockAxiosPost.mockRejectedValue(new Error('network error'))

    await expect(notifyJobFailure('wh_fail_job', 'oops')).resolves.toBeUndefined()
  })
})

describe('notifyJobFailure — email alert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WEBHOOK_URL
    mockConfig.alerts.failureEmail = 'alertas@test.cl'
    mockConfig.alerts.throttleHours = 6
    mockSendTransactional.mockResolvedValue(undefined)
  })

  it('emails the configured address on job failure', async () => {
    await notifyJobFailure('email_send_job', 'LLM 401')

    expect(mockSendTransactional).toHaveBeenCalledTimes(1)
    const arg = mockSendTransactional.mock.calls[0][0]
    expect(arg.to).toBe('alertas@test.cl')
    expect(arg.subject).toContain('email_send_job')
    expect(arg.body).toContain('email_send_job')
    expect(arg.body).toContain('LLM 401')
  })

  it('throttles repeat failures of the same job to one email per window', async () => {
    await notifyJobFailure('email_throttle_job', 'first failure')
    await notifyJobFailure('email_throttle_job', 'second failure')

    expect(mockSendTransactional).toHaveBeenCalledTimes(1)
  })

  it('does not email when failureEmail is empty', async () => {
    mockConfig.alerts.failureEmail = ''
    await notifyJobFailure('email_disabled_job', 'boom')

    expect(mockSendTransactional).not.toHaveBeenCalled()
  })

  it('does not throw when the email send fails', async () => {
    mockSendTransactional.mockRejectedValue(new Error('brevo down'))

    await expect(notifyJobFailure('email_error_job', 'boom')).resolves.toBeUndefined()
  })

  it('escapes HTML in the error to avoid breaking the email body', async () => {
    await notifyJobFailure('email_escape_job', '<script>alert(1)</script>')

    const arg = mockSendTransactional.mock.calls[0][0]
    expect(arg.body).toContain('&lt;script&gt;')
    expect(arg.body).not.toContain('<script>alert(1)</script>')
  })
})
