import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { assertUrlAllowed } from '../utils/urlValidation.js'

/**
 * axios GET with an SSRF guard on the initial URL AND every redirect hop.
 *
 * axios's `beforeRedirect` hook is synchronous, so it can only run the shallow
 * `isAllowedUrl` (no DNS) — leaving a DNS-rebinding-via-redirect hole: a 302 to
 * a public hostname that resolves to a private IP (e.g. cloud metadata) slipped
 * through. Here we disable automatic redirects (`maxRedirects: 0`) and follow
 * them manually, calling `assertUrlAllowed` (which DNS-resolves and rejects
 * private/reserved addresses) before each hop — the same defense favicon.ts
 * already uses for fetch().
 *
 * `isNonRedirect` lets a caller mark a 3xx status that is NOT a redirect and
 * must be returned as-is (e.g. 304 Not Modified from a conditional GET).
 */
export async function safeAxiosGet(
  url: string,
  config: AxiosRequestConfig,
  opts: { maxRedirects?: number; isNonRedirect?: (status: number) => boolean } = {},
): Promise<AxiosResponse> {
  const maxRedirects = opts.maxRedirects ?? 5
  let current = url

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlAllowed(current) // throws on private/reserved (incl. resolved DNS)

    const res = await axios.get(current, {
      ...config,
      maxRedirects: 0,
      // Accept 2xx and 3xx so we can inspect redirects ourselves; 4xx/5xx still
      // throw (axios default) and surface to the caller's try/catch.
      validateStatus: (status) => status >= 200 && status < 400,
    })

    const isRedirect = res.status >= 300 && res.status < 400
    if (!isRedirect || (opts.isNonRedirect && opts.isNonRedirect(res.status))) {
      return res
    }

    const location = res.headers['location']
    if (!location) return res // 3xx without Location — nothing to follow
    current = new URL(location, current).toString()
  }

  throw new Error(`Too many redirects (>${maxRedirects}) for ${url}`)
}
