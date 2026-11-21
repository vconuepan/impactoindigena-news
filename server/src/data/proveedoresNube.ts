/**
 * Redes de nube y hosting que cuenta la analitica, por numero de red (ASN).
 * Criterio y fuente en src/scripts/generar-redes-nube.ts.
 */
/** ASN → proveedor, como se muestra en el panel. */
export const PROVEEDORES: Record<number, string> = {
  16509: 'Amazon AWS', 14618: 'Amazon AWS', 8987: 'Amazon AWS',
  8075: 'Microsoft Azure',
  396982: 'Google Cloud', 15169: 'Google Cloud', 19527: 'Google Cloud',
  37963: 'Alibaba Cloud', 45102: 'Alibaba Cloud', 24429: 'Alibaba Cloud', 134963: 'Alibaba Cloud',
  45090: 'Tencent Cloud', 132203: 'Tencent Cloud', 133478: 'Tencent Cloud',
  55990: 'Huawei Cloud', 136907: 'Huawei Cloud',
  137718: 'ByteDance / Volcano Engine', 396986: 'ByteDance / Volcano Engine', 138699: 'ByteDance / Volcano Engine',
  38365: 'Baidu', 55967: 'Baidu',
  135377: 'UCloud',
  59019: 'Kingsoft Cloud',
  31898: 'Oracle Cloud',
  36351: 'IBM Cloud',
  16276: 'OVH', 35540: 'OVH',
  24940: 'Hetzner', 213230: 'Hetzner',
  14061: 'DigitalOcean',
  63949: 'Akamai Cloud (Linode)',
  20473: 'Vultr',
  12876: 'Scaleway', 29447: 'Scaleway',
  51167: 'Contabo', 40021: 'Contabo',
  60781: 'Leaseweb', 28753: 'Leaseweb', 395954: 'Leaseweb', 7203: 'Leaseweb', 30633: 'Leaseweb', 396190: 'Leaseweb', 32613: 'Leaseweb',
  47583: 'Hostinger',
  7979: 'Servers.com',
  33070: 'Rackspace', 19994: 'Rackspace', 27357: 'Rackspace',
  200350: 'Yandex Cloud',
  23576: 'NAVER Cloud',
}
