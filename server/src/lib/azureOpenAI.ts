import { config } from '../config.js'

/**
 * ¿Los servicios que no son chat (embeddings, voz y guion del podcast, imagen de respaldo)
 * van al recurso Azure OpenAI?
 *
 * Hasta el 21-nov-2026 cada uno lo decidía con `config.llm.provider === 'azure'`. Ese día el
 * chat pasó a Claude (`LLM_PROVIDER=anthropic`) y esos servicios cayeron a `new OpenAI()`, que
 * pide OPENAI_API_KEY y no existe en producción: el podcast y los embeddings se rompían.
 * Claude no ofrece embeddings, voz ni imágenes, así que con el proveedor `anthropic` lo que no
 * es chat se queda en Azure, siempre que sus credenciales estén puestas.
 *
 * `openai` y `openrouter` conservan su comportamiento anterior (OpenAI directo).
 */
export function usarAzureOpenAI(): boolean {
  const { provider, azure } = config.llm
  if (provider === 'azure') return true
  if (provider === 'anthropic') return Boolean(azure.endpoint && azure.apiKey)
  return false
}
