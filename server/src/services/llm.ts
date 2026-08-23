import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai'
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
 * Creates an LLM instance for the active provider.
 *
 * - provider=openai (default): OPENAI_API_KEY, supports reasoning effort.
 * - provider=openrouter: OPENROUTER_API_KEY + OpenRouter base URL.
 *   Set model names via OPENAI_MODEL_* env vars to OpenRouter IDs.
 * - provider=azure: Azure OpenAI Service.
 *   Requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY.
 *   Uses AZURE_OPENAI_DEPLOYMENT_{SMALL,MEDIUM,LARGE} for deployment names.
 *   No OPENAI_API_KEY needed when using Azure.
 */
function createLLM(tier: 'small' | 'medium' | 'large'): ChatOpenAI {
  const modelConfig = config.llm.models[tier]

  // ── Azure OpenAI ─────────────────────────────────────────────────────────
  if (config.llm.provider === 'azure') {
    return new AzureChatOpenAI({
      azureOpenAIEndpoint: config.llm.azure.endpoint,
      azureOpenAIApiKey: config.llm.azure.apiKey,
      azureOpenAIApiDeploymentName: config.llm.azure.deployments[tier],
      azureOpenAIApiVersion: config.llm.azure.apiVersion,
      maxRetries: 3,
      // Note: reasoning effort is not used — Azure deployments have their own
      // reasoning settings configured in Azure AI Studio.
    }) as unknown as ChatOpenAI
  }

  // ── OpenRouter ───────────────────────────────────────────────────────────
  if (config.llm.provider === 'openrouter' && config.llm.openrouterApiKey) {
    return new ChatOpenAI({
      model: modelConfig.name,
      maxRetries: 3,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.llm.openrouterApiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://vocesindigenas.org',
          'X-Title': 'Voces Indígenas',
        },
      },
    })
  }

  // ── OpenAI (default) ─────────────────────────────────────────────────────
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
