import { describe, it, expect } from 'vitest'
import { stripPort, clientIpFromForwardedFor, canonicalLimitIp, describeEntry } from './clientIp.js'

describe('stripPort', () => {
  it('quita el puerto de una IPv4', () => {
    expect(stripPort('203.0.113.5:51840')).toBe('203.0.113.5')
    expect(stripPort('203.0.113.5')).toBe('203.0.113.5')
  })

  it('quita el puerto de una IPv6 entre corchetes y deja intacta la IPv6 sin puerto', () => {
    expect(stripPort('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(stripPort('[2001:db8::1]')).toBe('2001:db8::1')
    expect(stripPort('2001:db8::1')).toBe('2001:db8::1')
  })
})

describe('describeEntry', () => {
  it('describe la forma de una entrada sin dejar pasar el valor', () => {
    expect(describeEntry('203.0.113.5')).toBe('v4')
    expect(describeEntry('203.0.113.5:51840')).toBe('v4:port')
    expect(describeEntry('2001:db8::1')).toBe('v6')
    expect(describeEntry('[2001:db8::1]:443')).toBe('v6:port')
    expect(describeEntry('basura')).toBe('other')
  })
})

describe('clientIpFromForwardedFor', () => {
  // Cadena real esperada: el borde de Static Web Apps agrega al lector y el App
  // Service agrega la salida de Static Web Apps. El lector queda penultimo.
  it('toma al lector, que es la penultima entrada, y le quita el puerto', () => {
    expect(clientIpFromForwardedFor('203.0.113.5:51840, 20.50.1.9', 2)).toBe('203.0.113.5')
  })

  it('un prefijo falsificado por el cliente no lo mueve: se cuenta desde la derecha', () => {
    expect(clientIpFromForwardedFor('9.9.9.9, 1.1.1.1, 203.0.113.5:51840, 20.50.1.9', 2)).toBe('203.0.113.5')
  })

  it('cambiar el puerto de la conexion no cambia al lector', () => {
    const a = clientIpFromForwardedFor('203.0.113.5:1111, 20.50.1.9', 2)
    const b = clientIpFromForwardedFor('203.0.113.5:2222, 20.50.1.9', 2)
    expect(a).toBe(b)
  })

  it('con otra cantidad de saltos de confianza se ajusta', () => {
    expect(clientIpFromForwardedFor('203.0.113.5, 20.1.1.1, 20.50.1.9', 3)).toBe('203.0.113.5')
  })

  it('si faltan entradas devuelve null, y quien llama usa la IP del socket', () => {
    expect(clientIpFromForwardedFor('20.50.1.9', 2)).toBeNull()
    expect(clientIpFromForwardedFor('', 2)).toBeNull()
    expect(clientIpFromForwardedFor(undefined, 2)).toBeNull()
  })

  it('si la entrada elegida no es una IP devuelve null en vez de usar basura como clave', () => {
    expect(clientIpFromForwardedFor('no-es-ip, 20.50.1.9', 2)).toBeNull()
  })

  it('con 0 queda desactivado: es el interruptor para volver al comportamiento anterior', () => {
    expect(clientIpFromForwardedFor('203.0.113.5, 20.50.1.9', 0)).toBeNull()
  })

  it('acepta un encabezado repetido (arreglo) y entradas con espacios', () => {
    expect(clientIpFromForwardedFor(['  203.0.113.5:80 ', ' 20.50.1.9 '], 2)).toBe('203.0.113.5')
  })

  it('lee una IPv6 con puerto entre corchetes', () => {
    expect(clientIpFromForwardedFor('[2001:db8:aaaa:1::7]:443, 20.50.1.9', 2)).toBe('2001:db8:aaaa:1::')
  })
})

describe('canonicalLimitIp', () => {
  it('una IPv4 queda igual', () => {
    expect(canonicalLimitIp('203.0.113.5')).toBe('203.0.113.5')
  })

  it('una IPv4 mapeada en IPv6 es la IPv4', () => {
    expect(canonicalLimitIp('::ffff:203.0.113.5')).toBe('203.0.113.5')
  })

  // Un lector con IPv6 recibe un /64 entero: sin agrupar, cambiar de direccion
  // dentro de su bloque le da un cupo nuevo en cada peticion.
  it('dos direcciones del mismo /64 comparten clave y /64 distintos no', () => {
    const a = canonicalLimitIp('2001:db8:aaaa:1::1')
    const b = canonicalLimitIp('2001:db8:aaaa:1:ffff:eeee:dddd:cccc')
    const otro = canonicalLimitIp('2001:db8:aaaa:2::1')
    expect(a).toBe(b)
    expect(a).not.toBe(otro)
  })

  it('devuelve una IPv6 valida para que express-rate-limit no se queje', async () => {
    const { isIP } = await import('node:net')
    expect(isIP(canonicalLimitIp('2001:db8:aaaa:1::1')!)).toBe(6)
  })

  it('lo que no es una IP da null', () => {
    expect(canonicalLimitIp('basura')).toBeNull()
  })
})
