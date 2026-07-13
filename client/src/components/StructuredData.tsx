/**
 * Renders one or more JSON-LD structured data scripts.
 * Usage: <StructuredData data={schema} /> or <StructuredData data={[schema1, schema2]} />
 */
// Escape characters that could break out of the <script> context. Escaping `<`,
// `>`, and `&` to their unicode forms is the standard hardened JSON-LD encoder —
// it neutralizes </script>, <!--, and similar sequences in embedded content.
function encodeJsonLd(item: Record<string, unknown>): string {
  return JSON.stringify(item)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export default function StructuredData({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const items = Array.isArray(data) ? data : [data]
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: encodeJsonLd(item) }}
        />
      ))}
    </>
  )
}
