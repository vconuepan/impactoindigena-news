import { ChatOpenAI } from '@langchain/openai'
import { config } from '../config.js'

let nextAvailableTime = 0

export async function rateLimitDelay(): Promise<void> {
  const now = Date.now()
  const waitUntil = Math.max(nextAvailableTime, now)
  nextAvailableTime = waitUntil + config.llm.delayMs
  const waitMs = waitUntil - now
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs))
  }
}

/**
 * Creates a ChatOpenAI instance configured for the active provider.
 *
 * - provider=openai (default): uses OPENAI_API_KEY directly with reasoning support.
 * - provider=openrouter: uses OPENROUTER_API_KEY with OpenRouter base URL.
 *   Reasoning effort is skipped — OpenRouter models ignore it and some reject it.
 *   Set model names to OpenRouter IDs via env vars, e.g.:
 *     OPENAI_MODEL_SMALL=deepseek/deepseek-chat-v3-5
 *     OPENAI_MODEL_MEDIUM=deepseek/deepseek-chat-v3-5
 *     OPENAI_MODEL_LARGE=deepseek/deepseek-chat-v3-5
 *
 * OPENAI_API_KEY is always required for embeddings regardless of provider.
 */
function createLLM(tier: 'small' | 'medium' | 'large'): ChatOpenAI {
  const modelConfig = config.llm.models[tier]
  const useOpenRouter =
    config.llm.provider === 'openrouter' && config.llm.openrouterApiKey

  if (useOpenRouter) {
    return new ChatOpenAI({
      model: modelConfig.name,
      maxRetries: 3,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.llm.openrouterApiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://impactoindigena.news',
          'X-Title': 'Impacto Indígena',
        },
      },
    })
  }

  return new ChatOpenAI({
    model: modelConfig.name,
    reasoning: { effort: modelConfig.reasoningEffort },
    maxRetries: 3,
  })
}

let _smallLLM: ChatOpenAI | null = null
let _mediumLLM: ChatOpenAI | null = null
let _largeLLM: ChatOpenAI | null = null

export function getSmallLLM(): ChatOpenAI {
  if (!_smallLLM) _smallLLM = createLLM('small')
  return _smallLLM
}

export function getMediumLLM(): ChatOpenAI {
  if (!_mediumLLM) _mediumLLM = createLLM('medium')
  return _mediumLLM
}

export function getLargeLLM(): ChatOpenAI {
  if (!_largeLLM) _largeLLM = createLLM('large')
  return _largeLLM
}

export function getLLMByTier(tier: 'small' | 'medium' | 'large'): ChatOpenAI {
  switch (tier) {
    case 'small': return getSmallLLM()
    case 'medium': return getMediumLLM()
    case 'large': return getLargeLLM()
  }
}
