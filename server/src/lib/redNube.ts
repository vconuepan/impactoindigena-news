import { isIP } from 'node:net'
import { ASNS, V4, V6, V6_ASN, EDICION } from '../data/redesNube.js'
import { PROVEEDORES } from '../data/proveedoresNube.js'
import { expandIpv6 } from '../utils/urlValidation.js'

/**
 * ¿La IP pertenece a una red de nube o centro de datos?
 *
 * Es la señal mas fuerte contra los robots que inflaban el panel: medido el
 * 20-nov-2026, China, Singapur y Hong Kong sumaban el 55 % de los visitantes con
 * 0-0,4 % de moviles, el perfil de servidores en Alibaba o Tencent, no de
 * lectores. La lista sale de DB-IP (src/data/redesNube.ts, generada por
 * scripts/generar-redes-nube.ts) y deja fuera, a proposito, las redes por donde
 * pasan personas reales: Cloudflare, Akamai CDN, Fastly y los hosters de VPN.
 *
 * Todo ocurre en memoria y en el momento: no se consulta a ningun servicio
 * externo y la IP no se guarda.
 */

export type Red = { tipo: 'nube'; proveedor: string; asn: number } | { tipo: 'otra' }

export const EDICION_REDES = EDICION

function v4aNumero(ip: string): number {
  return ip.split('.').reduce((n, o) => n * 256 + Number(o), 0)
}

function v6aHex(ip: string): string | null {
  const g = expandIpv6(ip)
  return g ? g.map((x) => x.toString(16).padStart(4, '0')).join('') : null
}

function nube(asnIndice: number): Red {
  const asn = ASNS[asnIndice]
  return { tipo: 'nube', proveedor: PROVEEDORES[asn] ?? `AS${asn}`, asn }
}

export function redDeIp(ip: string | undefined | null): Red {
  if (!ip) return { tipo: 'otra' }
  const tipo = isIP(ip)
  if (tipo === 4) {
    const n = v4aNumero(ip)
    // Ultimo rango cuyo inicio <= n.
    let lo = 0, hi = V4.length / 3 - 1, hallado = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (V4[mid * 3] <= n) { hallado = mid; lo = mid + 1 } else hi = mid - 1
    }
    if (hallado >= 0 && n <= V4[hallado * 3 + 1]) return nube(V4[hallado * 3 + 2])
    return { tipo: 'otra' }
  }
  if (tipo === 6) {
    const h = v6aHex(ip)
    if (!h) return { tipo: 'otra' }
    let lo = 0, hi = V6.length / 2 - 1, hallado = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (V6[mid * 2] <= h) { hallado = mid; lo = mid + 1 } else hi = mid - 1
    }
    if (hallado >= 0 && h <= V6[hallado * 2 + 1]) return nube(V6_ASN[hallado])
    return { tipo: 'otra' }
  }
  return { tipo: 'otra' }
}
