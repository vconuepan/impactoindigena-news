// El servidor guarda el país del visitante como código ISO de dos letras, y
// `XX` cuando no lo sabe. `Intl.DisplayNames` da el nombre en español de
// cualquier país, no solo de una lista escrita a mano: con la lista anterior,
// de 20 países, el resto salía como código («CN» en lugar de «China»).

let regionNames: Intl.DisplayNames | null = null
try {
  regionNames = new Intl.DisplayNames(['es'], { type: 'region' })
} catch {
  regionNames = null
}

export function countryName(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!upper || upper === 'XX') return 'Desconocido'
  if (!/^[A-Z]{2}$/.test(upper)) return code
  try {
    return regionNames?.of(upper) ?? upper
  } catch {
    return upper
  }
}
