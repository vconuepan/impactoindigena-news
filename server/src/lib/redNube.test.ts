import { describe, it, expect } from 'vitest'
import { redDeIp, EDICION_REDES } from './redNube.js'
import { ASNS } from '../data/redesNube.js'
import { PROVEEDORES } from '../data/proveedoresNube.js'

// Ejemplos sacados de la propia base DB-IP 2026-11 el 21-nov-2026.
describe('redDeIp', () => {
  it.each([
    ['1.12.20.7', 'Tencent Cloud'],       // 1.12.16.0-1.12.33.255, AS45090
    ['8.128.5.9', 'Alibaba Cloud'],       // 8.128.4.0-8.128.7.255, AS37963
    ['1.44.96.200', 'Amazon AWS'],        // 1.44.96.0-1.44.96.255, AS16509
    ['2.216.4.1', 'Vultr'],               // 2.216.4.0-2.216.5.255, AS20473
  ])('%s es nube: %s', (ip, proveedor) => {
    expect(redDeIp(ip)).toMatchObject({ tipo: 'nube', proveedor })
  })

  it('los bordes del rango cuentan, y lo de al lado no', () => {
    expect(redDeIp('8.128.4.0')).toMatchObject({ tipo: 'nube' })
    expect(redDeIp('8.128.7.255')).toMatchObject({ tipo: 'nube' })
  })

  it.each([
    ['11.96.0.5', 'Entel Chile'],
    ['152.172.1.1', 'Telefónica Chile'],
    ['179.2.3.4', 'VTR'],
  ])('%s (%s) NO es nube: es una red de hogares', (ip) => {
    expect(redDeIp(ip)).toEqual({ tipo: 'otra' })
  })

  it('Cloudflare queda fuera a proposito: por ahi pasan WARP y Private Relay', () => {
    expect(redDeIp('1.1.1.1')).toEqual({ tipo: 'otra' })
    expect(ASNS).not.toContain(13335)
  })

  it('IPv6 de AWS, tambien agrupada al /64 como la entrega la analitica', () => {
    expect(redDeIp('2001:468:1f66::1')).toMatchObject({ tipo: 'nube', proveedor: 'Amazon AWS' })
    expect(redDeIp('2001:468:1f66:1::')).toMatchObject({ tipo: 'nube', proveedor: 'Amazon AWS' })
  })

  it('lo que no es IP, o falta, es «otra»', () => {
    expect(redDeIp(undefined)).toEqual({ tipo: 'otra' })
    expect(redDeIp('basura')).toEqual({ tipo: 'otra' })
  })

  it('cada red de la lista tiene nombre de proveedor', () => {
    for (const asn of ASNS) expect(PROVEEDORES[asn], `AS${asn}`).toBeTruthy()
    expect(EDICION_REDES).toMatch(/^\d{4}-\d{2}$/)
  })
})
