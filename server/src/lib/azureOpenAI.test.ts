/**
 * Candado del 21-nov-2026: con el chat en Claude (LLM_PROVIDER=anthropic), embeddings, voz y
 * guion del podcast y la imagen de respaldo siguen en Azure OpenAI. Sin esto caían a
 * `new OpenAI()` y pedían una OPENAI_API_KEY que producción no tiene.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

async function cargar(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? '')
  return import('./azureOpenAI.js')
}

const AZURE = { AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com', AZURE_OPENAI_API_KEY: 'k' }

afterEach(() => { vi.unstubAllEnvs() })

describe('usarAzureOpenAI', () => {
  it('con LLM_PROVIDER=azure, sí (como siempre)', async () => {
    const { usarAzureOpenAI } = await cargar({ LLM_PROVIDER: 'azure', ...AZURE })
    expect(usarAzureOpenAI()).toBe(true)
  })

  it('con LLM_PROVIDER=anthropic y Azure configurado, sí: Claude no hace embeddings, voz ni imágenes', async () => {
    const { usarAzureOpenAI } = await cargar({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant', ...AZURE })
    expect(usarAzureOpenAI()).toBe(true)
  })

  it('con LLM_PROVIDER=anthropic sin credenciales de Azure, no', async () => {
    const { usarAzureOpenAI } = await cargar({ LLM_PROVIDER: 'anthropic', AZURE_OPENAI_ENDPOINT: undefined, AZURE_OPENAI_API_KEY: undefined })
    expect(usarAzureOpenAI()).toBe(false)
  })

  it('openai y openrouter conservan OpenAI directo aunque haya credenciales de Azure', async () => {
    for (const p of ['openai', 'openrouter']) {
      const { usarAzureOpenAI } = await cargar({ LLM_PROVIDER: p, ...AZURE })
      expect(usarAzureOpenAI()).toBe(false)
    }
  })
})
