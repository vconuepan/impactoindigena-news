/**
 * LLM_PROVIDER=anthropic · la IA del .news puede correr sobre la API de Claude.
 *
 * Decisión del director, 21-nov-2026: usar los créditos de API de Claude y ahorrar créditos de
 * Azure. Este candado fija que el proveedor se elige por variable, que cada tier toma su modelo,
 * que sin clave no se rompe nada (cae al proveedor por defecto) y que el contrato que usan los
 * jobs —withStructuredOutput con functionCalling— existe en el modelo de Claude.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'

async function cargar(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v ?? '')
  return import('./llm.js')
}

afterEach(() => { vi.unstubAllEnvs() })

describe('services/llm · proveedor Claude', () => {
  it('con LLM_PROVIDER=anthropic y clave, los tiers usan Haiku 5.5 y el grande Sonnet 5.5', async () => {
    const { getSmallLLM, getMediumLLM, getLargeLLM } = await cargar({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-prueba' })
    const { ChatAnthropic } = await import('@langchain/anthropic')
    expect(getSmallLLM()).toBeInstanceOf(ChatAnthropic)
    expect((getSmallLLM() as unknown as { model: string }).model).toBe('claude-haiku-5-5')
    expect((getMediumLLM() as unknown as { model: string }).model).toBe('claude-haiku-5-5')
    expect((getLargeLLM() as unknown as { model: string }).model).toBe('claude-sonnet-5-5')
  })

  it('los modelos se pueden cambiar por variable sin tocar código', async () => {
    const { getLargeLLM } = await cargar({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-prueba', ANTHROPIC_MODEL_LARGE: 'claude-haiku-5-5' })
    expect((getLargeLLM() as unknown as { model: string }).model).toBe('claude-haiku-5-5')
  })

  it('sin clave no se rompe: cae al proveedor por defecto, igual que OpenRouter', async () => {
    const { getMediumLLM } = await cargar({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: 'sk-prueba' })
    const { ChatAnthropic } = await import('@langchain/anthropic')
    expect(getMediumLLM()).not.toBeInstanceOf(ChatAnthropic)
  })

  it('ofrece el contrato que usan los jobs: withStructuredOutput con functionCalling', async () => {
    const { getMediumLLM } = await cargar({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-prueba' })
    const esquema = z.object({ relevancia: z.number(), razon: z.string() })
    const conEstructura = getMediumLLM().withStructuredOutput(esquema, { method: 'functionCalling' })
    expect(typeof conEstructura.invoke).toBe('function')
  })
})
