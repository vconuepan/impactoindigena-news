import { describe, it, expect, vi, beforeEach } from 'vitest'

// safeAxiosGet is the SSRF-safe channel; rehostExternalImage MUST route the
// attacker-influenced og:image URL through it rather than a raw fetch.
const mockSafeAxiosGet = vi.hoisted(() => vi.fn())
vi.mock('./safeHttp.js', () => ({ safeAxiosGet: mockSafeAxiosGet }))

// Stub the S3 client so uploadImageToR2 never touches the network.
const mockS3Send = vi.hoisted(() => vi.fn())
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send
  },
  PutObjectCommand: class {
    constructor(args: unknown) {
      Object.assign(this, args)
    }
  },
}))

const warnSpy = vi.hoisted(() => vi.fn())
vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: warnSpy, error: () => {} }),
}))

vi.mock('../config.js', () => ({
  config: {
    r2: {
      endpoint: 'https://r2.example',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucketName: 'bucket',
      publicUrl: 'https://cdn.example',
    },
  },
}))

const { rehostExternalImage, downloadExternalImage } = await import('./imageStorage.js')

function imageResponse(contentType: string, bytes: number) {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    data: Buffer.alloc(bytes, 1),
  }
}

describe('rehostExternalImage — SSRF-safe og:image download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockS3Send.mockResolvedValue({})
  })

  it('downloads through safeAxiosGet (not raw fetch) and re-hosts to R2', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('image/jpeg', 1000))

    const url = await rehostExternalImage('https://source.example/og.jpg', 'story-1')

    expect(mockSafeAxiosGet).toHaveBeenCalledTimes(1)
    expect(mockSafeAxiosGet).toHaveBeenCalledWith(
      'https://source.example/og.jpg',
      expect.objectContaining({ responseType: 'arraybuffer', maxContentLength: 8_000_000 }),
    )
    expect(mockS3Send).toHaveBeenCalledTimes(1)
    expect(url).toBe('https://cdn.example/social/oghero-story-1.jpg')
  })

  it('returns null and never uploads when the guard blocks the URL (SSRF attempt)', async () => {
    // safeAxiosGet throws when assertUrlAllowed rejects a private/metadata host.
    mockSafeAxiosGet.mockRejectedValue(new Error('Blocked host resolving to private address'))

    const url = await rehostExternalImage('http://169.254.169.254/latest/meta-data/', 'story-2')

    expect(url).toBeNull()
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('rejects a non-image content-type without uploading', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('text/html', 500))

    const url = await rehostExternalImage('https://source.example/not-an-image', 'story-3')

    expect(url).toBeNull()
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('rejects an oversized image without uploading', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('image/png', 8_000_001))

    const url = await rehostExternalImage('https://source.example/huge.png', 'story-4')

    expect(url).toBeNull()
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('rejects an empty response body without uploading', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('image/png', 0))

    const url = await rehostExternalImage('https://source.example/empty.png', 'story-5')

    expect(url).toBeNull()
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('maps content-type to the right extension', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('image/webp', 1234))

    const url = await rehostExternalImage('https://source.example/og.webp', 'story-6')

    expect(url).toBe('https://cdn.example/social/oghero-story-6.webp')
  })
})

// downloadExternalImage is the shared choke point (rehost + branded-card path in
// storyCard.ts). The SSRF guard must live here so both callers are protected.
describe('downloadExternalImage — shared SSRF-safe fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches through safeAxiosGet and returns bytes + inferred extension', async () => {
    mockSafeAxiosGet.mockResolvedValue(imageResponse('image/png', 42))

    const dl = await downloadExternalImage('https://source.example/og.png')

    expect(mockSafeAxiosGet).toHaveBeenCalledWith(
      'https://source.example/og.png',
      expect.objectContaining({ responseType: 'arraybuffer', maxContentLength: 8_000_000 }),
    )
    expect(dl).toEqual({ buffer: expect.any(Buffer), contentType: 'image/png', ext: 'png' })
    expect(dl?.buffer.length).toBe(42)
  })

  it('returns null when the guard blocks an internal address (SSRF attempt)', async () => {
    mockSafeAxiosGet.mockRejectedValue(new Error('Blocked host resolving to private address'))

    const dl = await downloadExternalImage('http://169.254.169.254/latest/meta-data/')

    expect(dl).toBeNull()
  })
})
