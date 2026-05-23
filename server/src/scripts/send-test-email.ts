/**
 * Send a test newsletter email directly to a specified address.
 * Uses the most recent newsletter that has HTML content,
 * or generates HTML from the most recent newsletter with content.
 *
 * Usage: npx tsx src/scripts/send-test-email.ts [email]
 * Default email: venancio.conuepan@empresasindigenas.org
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

const BREVO_API_KEY = process.env.BREVO_API_KEY!
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'venancio@impactoindigena.com'
const FROM_NAME = process.env.BREVO_FROM_NAME || 'Impacto Indígena'
const TO_EMAIL = process.argv[2] || 'venancio.conuepan@empresasindigenas.org'

async function main() {
  console.log(`\n📧 Buscando newsletter con content para enviar a: ${TO_EMAIL}\n`)

  // 1. Find most recent newsletter with content (always regenerate HTML to use latest template)
  const withContent = await prisma.newsletter.findFirst({
    where: { content: { not: '' } },
    orderBy: { createdAt: 'desc' },
  })
  if (!withContent?.content) {
    console.error('❌ No hay newsletters con contenido en la base de datos.')
    console.error('   Crea uno desde el admin primero.')
    process.exit(1)
  }

  // 2. Regenerate HTML with the latest template (overwrites whatever was in DB)
  const { generateHtmlContent } = await import('../services/newsletter.js')
  console.log(`⚙️  Regenerando HTML para: "${withContent.title}"...`)
  const htmlContent = await generateHtmlContent(withContent.id)
  const newsletter = await prisma.newsletter.findUniqueOrThrow({ where: { id: withContent.id } })
  console.log(`✅ HTML generado (${htmlContent.length.toLocaleString()} chars)\n`)

  console.log(`📋 Newsletter: "${newsletter.title}"`)
  console.log(`📅 Creado: ${newsletter.createdAt.toLocaleDateString('es-CL')}`)
  console.log(`📏 HTML: ${htmlContent.length.toLocaleString()} caracteres\n`)

  // 3. Send via Brevo transactional API
  console.log(`🚀 Enviando a ${TO_EMAIL}...`)

  const response = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      to: [{ email: TO_EMAIL, name: 'Venancio' }],
      subject: `[TEST] ${newsletter.title}`,
      htmlContent,
      sender: { email: FROM_EMAIL, name: FROM_NAME },
    },
    {
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  )

  if (response.status === 201) {
    console.log(`✅ ¡Enviado! Revisa tu email: ${TO_EMAIL}`)
    console.log(`   messageId: ${response.data.messageId}`)
  } else {
    console.error('❌ Error:', response.status, response.data)
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('❌ Error:', err.message || err)
  process.exit(1)
})
