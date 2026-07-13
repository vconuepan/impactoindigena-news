import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

// Hostname suffixes/names that never resolve to a public host.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums
}

/** True for private, loopback, link-local, CGNAT, and other non-public IPv4 ranges. */
function isBlockedIpv4(ip: string): boolean {
  const p = ipv4Parts(ip)
  if (!p) return false
  const [a, b, c] = p
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24 IETF protocol assignments (NOT the whole /16 — 192.0.64.0/18 etc. is public)
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmarking
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

/** Expand an IPv6 string into 8 16-bit groups, handling `::` and embedded IPv4. */
function expandIpv6(input: string): number[] | null {
  let ip = input.split('%')[0].toLowerCase() // drop zone id

  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  let tail: number[] = []
  const v4 = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (v4) {
    const parts = ipv4Parts(v4[1])
    if (!parts) return null
    tail = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]]
    // Strip the IPv4 tail, preserving the group separator structure:
    //   '::1.2.3.4'      -> '::'      (keep the zero-run marker)
    //   '::ffff:1.2.3.4' -> '::ffff'  (drop the single trailing ':')
    //   '64:ff9b::1.2.3.4' -> '64:ff9b::'
    ip = ip.slice(0, ip.length - v4[1].length)
    if (!ip.endsWith('::') && ip.endsWith(':')) ip = ip.slice(0, -1)
    if (ip === '') return null
  }

  const halves = ip.split('::')
  if (halves.length > 2) return null

  const toGroups = (s: string): number[] | null => {
    if (!s) return []
    const out: number[] = []
    for (const part of s.split(':')) {
      if (part === '' || !/^[0-9a-f]{1,4}$/.test(part)) return null
      out.push(parseInt(part, 16))
    }
    return out
  }

  const head = toGroups(halves[0])
  if (head === null) return null

  let groups: number[]
  if (halves.length === 2) {
    const rest = toGroups(halves[1])
    if (rest === null) return null
    const missing = 8 - head.length - rest.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill(0), ...rest, ...tail]
  } else {
    groups = [...head, ...tail]
  }

  if (groups.length !== 8) return null
  if (groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null
  return groups
}

/** Render the IPv4 embedded in two 16-bit groups as a dotted string. */
function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

function isBlockedIpv6(ip: string): boolean {
  const g = expandIpv6(ip)
  if (!g) return false

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) — check the embedded v4
  const allZeroHigh = g.slice(0, 5).every((x) => x === 0)
  if (allZeroHigh && (g[5] === 0xffff || g[5] === 0)) {
    // ::/128 unspecified and ::1 loopback are covered here too
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true
    return isBlockedIpv4(v4FromGroups(g[6], g[7]))
  }

  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 in the last 32 bits,
  // so 64:ff9b::169.254.169.254 reaches cloud metadata via IPv6.
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isBlockedIpv4(v4FromGroups(g[6], g[7]))
  }

  // 6to4 2002::/16 embeds the IPv4 in groups 1-2 (2002:V4V4:V4V4::), so
  // 2002:7f00:0001:: is 127.0.0.1.
  if (g[0] === 0x2002) {
    return isBlockedIpv4(v4FromGroups(g[1], g[2]))
  }

  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

/** True if the given literal IP address (v4 or v6) is not a public, routable address. */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isBlockedIpv4(ip)
  if (kind === 6) return isBlockedIpv6(ip)
  return false
}

/**
 * Synchronous SSRF guard. Rejects non-http(s) URLs, blocked hostnames, and any
 * literal private/reserved IP (including IPv4 in decimal/hex/octal form, which
 * the WHATWG URL parser normalizes, and IPv4-mapped IPv6). Does NOT resolve DNS
 * — use {@link assertUrlAllowed} for outbound fetches so a public hostname that
 * resolves to a private address is also caught.
 */
export function isAllowedUrl(urlStr: string): boolean {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (!hostname) return false
  if (BLOCKED_HOSTNAME_PATTERNS.some((re) => re.test(hostname))) return false
  if (isBlockedIp(hostname)) return false
  return true
}

/**
 * Async SSRF guard for outbound requests: applies {@link isAllowedUrl}, then
 * resolves the hostname and rejects if any resolved address is private/reserved.
 * Throws on rejection so callers' existing try/catch treats it as a fetch failure.
 */
export async function assertUrlAllowed(urlStr: string): Promise<void> {
  if (!isAllowedUrl(urlStr)) {
    throw new Error(`Blocked disallowed URL: ${urlStr}`)
  }

  const hostname = new URL(urlStr).hostname.replace(/^\[|\]$/g, '')
  if (isIP(hostname)) return // already validated as a literal above

  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    // DNS failure — let the real request surface the error rather than passing.
    throw new Error(`Could not resolve host: ${hostname}`)
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new Error(`Blocked host ${hostname} resolving to private address ${address}`)
    }
  }
}
