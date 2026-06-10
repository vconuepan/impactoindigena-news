/**
 * trigger-pipeline.ts
 *
 * Dispara el pipeline de assessment en el servidor de producción.
 * Usa las credenciales de admin para obtener un JWT y luego llama
 * a los endpoints de jobs.
 *
 * Uso:
 *   npx tsx src/scripts/trigger-pipeline.ts <email> <password>
 */
import axios from 'axios'

const API = 'https://impactoindigena.news'
const JOBS = ['preassess_stories', 'assess_stories', 'publish_stories']

const [, , email, password] = process.argv
if (!email || !password) {
  console.error('Uso: npx tsx src/scripts/trigger-pipeline.ts <email> <contraseña>')
  process.exit(1)
}

async function main() {
  // 1. Login
  console.log(`\n🔐 Autenticando como ${email}...`)
  const loginRes = await axios.post(`${API}/api/auth/login`, { email, password })
  const token: string = loginRes.data.token
  if (!token) throw new Error('No se recibió token')
  console.log('   ✓ Token obtenido')

  const headers = { Authorization: `Bearer ${token}` }

  // 2. Trigger each job in sequence (fire-and-forget on server side)
  for (const job of JOBS) {
    console.log(`\n⚡ Disparando ${job}...`)
    const res = await axios.post(`${API}/api/admin/jobs/${job}/run`, {}, { headers })
    console.log(`   ✓ ${res.data.message}`)
    // Small delay so they don't all pile up instantly
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log('\n✅ Los tres jobs están corriendo en producción.')
  console.log('   Puedes seguir el progreso en los logs de Render.com.')
  console.log('   En ~10-15 min los artículos deberían estar publicados.')
}

main().catch(err => {
  const msg = err.response?.data?.error ?? err.message
  console.error('\n❌', msg)
  process.exit(1)
})
