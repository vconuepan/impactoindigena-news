import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: { linkedin: { clientSecret: 'test-secret' } },
}))

const { createOAuthState, verifyOAuthState } = await import('./linkedinOAuthState.js')

describe('LinkedIn OAuth state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts a state it just issued', () => {
    expect(verifyOAuthState(createOAuthState())).toBe(true)
  })

  it('issues a different state every time', () => {
    expect(createOAuthState()).not.toBe(createOAuthState())
  })

  // Lo que protege la ruta pública del callback: sin esto, cualquiera podría
  // canjear un código propio y dejar el sitio publicando en su cuenta.
  it('rejects a forged signature', () => {
    const state = createOAuthState()
    const [expiry, nonce] = state.split('.')

    expect(verifyOAuthState(`${expiry}.${nonce}.firma-inventada`)).toBe(false)
  })

  it('rejects a state whose payload was tampered with', () => {
    const [, nonce, signature] = createOAuthState().split('.')
    const farFuture = Date.now() + 10 * 86_400_000

    expect(verifyOAuthState(`${farFuture}.${nonce}.${signature}`)).toBe(false)
  })

  it('rejects an expired state', () => {
    const state = createOAuthState()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)

    expect(verifyOAuthState(state)).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not segmented', 'abc'],
    ['too few segments', 'a.b'],
    ['too many segments', 'a.b.c.d'],
  ])('rejects malformed input (%s)', (_label, input) => {
    expect(verifyOAuthState(input as string | undefined)).toBe(false)
  })
})
