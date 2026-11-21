import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Las miniaturas de Bluesky y la imagen de X se descargan desde la og:image de
 * un tercero. Hasta el 21-nov-2026 eran un `fetch` crudo que seguia
 * redirecciones sin revisar (hermanos del `fetchOgImage` arreglado el 11-oct), y
 * en Bluesky lo descargado se subia a un post publico. Ahora pasan por
 * `safeAxiosGet`, que revisa la URL y cada salto.
 */

const h = vi.hoisted(() => {
  process.env.BLUESKY_HANDLE = 'prueba.bsky.social'
  process.env.BLUESKY_APP_PASSWORD = 'clave-de-prueba'
  return {
    safeAxiosGet: vi.fn(),
    uploadBlob: vi.fn(),
    post: vi.fn(),
  }
})

vi.mock('./safeHttp.js', () => ({ safeAxiosGet: h.safeAxiosGet }))
vi.mock('@atproto/api', () => ({
  AtpAgent: class {
    login = vi.fn().mockResolvedValue({})
    uploadBlob = h.uploadBlob
    post = h.post
  },
  RichText: class {
    text: string
    facets: unknown[] | undefined
    constructor({ text }: { text: string }) {
      this.text = text
    }
    detectFacets = vi.fn().mockResolvedValue(undefined)
  },
}))

const { createPost } = await import('./bluesky.js')
const { fetchImageBuffer } = await import('./twitter.js')

const THUMB = 'https://medio.example/og.jpg'
const card = { uri: 'https://vocesindigenas.org/stories/x', title: 'T', description: 'D', thumbUrl: THUMB }

describe('Bluesky link-card thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.post.mockResolvedValue({ uri: 'at://x', cid: 'c' })
    h.uploadBlob.mockResolvedValue({ data: { blob: { ref: 'blob' } } })
  })

  it('downloads the thumbnail through the SSRF-guarded client, never a raw fetch', async () => {
    const rawFetch = vi.spyOn(globalThis, 'fetch')
    h.safeAxiosGet.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/jpeg' } })
    await createPost('Texto Medio', card, 'Medio', 'https://medio.example/nota')
    expect(h.safeAxiosGet).toHaveBeenCalledWith(THUMB, expect.objectContaining({ maxContentLength: 1_000_000 }))
    expect(rawFetch).not.toHaveBeenCalled()
    expect(h.uploadBlob).toHaveBeenCalledTimes(1)
    expect(h.post.mock.calls[0][0].embed.external.thumb).toEqual({ ref: 'blob' })
    rawFetch.mockRestore()
  })

  it('posts without a thumbnail when the guard rejects the URL', async () => {
    h.safeAxiosGet.mockRejectedValue(new Error('URL not allowed: private address'))
    await createPost('Texto', card, 'Medio', 'https://medio.example/nota')
    expect(h.uploadBlob).not.toHaveBeenCalled()
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.post.mock.calls[0][0].embed.external.thumb).toBeUndefined()
  })

  it('does not upload a response that is not an image', async () => {
    h.safeAxiosGet.mockResolvedValue({ data: Buffer.from('{"secreto":1}'), headers: { 'content-type': 'application/json' } })
    await createPost('Texto', card, 'Medio', 'https://medio.example/nota')
    expect(h.uploadBlob).not.toHaveBeenCalled()
  })
})

describe('X (Twitter) image download', () => {
  beforeEach(() => vi.clearAllMocks())

  it('goes through the SSRF-guarded client with a size cap', async () => {
    h.safeAxiosGet.mockResolvedValue({ data: new Uint8Array([9]), headers: { 'content-type': 'image/png' } })
    const buf = await fetchImageBuffer(THUMB)
    expect(buf.length).toBe(1)
    expect(h.safeAxiosGet).toHaveBeenCalledWith(THUMB, expect.objectContaining({ maxContentLength: 5_000_000 }))
  })

  it('refuses a response that is not an image', async () => {
    h.safeAxiosGet.mockResolvedValue({ data: Buffer.from('x'), headers: { 'content-type': 'text/html' } })
    await expect(fetchImageBuffer(THUMB)).rejects.toThrow(/Not an image/)
  })
})
