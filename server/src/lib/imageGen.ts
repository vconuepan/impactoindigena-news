import OpenAI, { AzureOpenAI } from 'openai'
import { config } from '../config.js'
import { createLogger } from './logger.js'
import { uploadImageToR2 } from './imageStorage.js'

const log = createLogger('image-gen')

/**
 * Devuelve el cliente OpenAI correcto según el proveedor configurado.
 * - LLM_PROVIDER=azure  → AzureOpenAI (usa AZURE_OPENAI_* vars)
 * - Cualquier otro      → OpenAI directo (usa OPENAI_API_KEY)
 */
function getImageClient(): { client: OpenAI | AzureOpenAI; model: string } {
  if (config.llm.provider === 'azure') {
    const client = new AzureOpenAI({
      endpoint: config.llm.azure.endpoint,
      apiKey: config.llm.azure.apiKey,
      apiVersion: config.llm.azure.apiVersion,
      deployment: config.llm.azure.deployments.dalle,
    })
    return { client, model: config.llm.azure.deployments.dalle }
  }
  return { client: new OpenAI(), model: 'dall-e-3' }
}

/**
 * Genera una imagen con DALL-E 3 para una historia y la sube a R2.
 * Retorna la URL pública de la imagen.
 */
export async function generateStoryImage(
  storyId: string,
  title: string,
  summary: string,
): Promise<string> {
  const prompt = `
Create a powerful, respectful editorial illustration for an indigenous news story.
Title: "${title}"
Summary: "${summary}"

Style: Bold, modern editorial photography style. Dignified and respectful representation.
Use warm earth tones, natural landscapes, or symbolic indigenous elements.
NO text, NO words, NO letters in the image.
Cinematic composition, high contrast, visually striking.
`.trim()

  log.info({ storyId, title: title.slice(0, 50), provider: config.llm.provider }, 'generating DALL-E image')

  const { client, model } = getImageClient()

  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
    response_format: 'b64_json',
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('No image data returned from DALL-E')

  const imageBuffer = Buffer.from(b64, 'base64')
  const filename = `${storyId}-${Date.now()}.png`

  const publicUrl = await uploadImageToR2(imageBuffer, filename)

  log.info({ storyId, publicUrl }, 'story image generated and uploaded')
  return publicUrl
}
