import OpenAI, { AzureOpenAI } from 'openai'
import { config } from '../config.js'
import { createLogger } from './logger.js'
import { uploadImageToR2 } from './imageStorage.js'

const log = createLogger('image-gen')

/**
 * Devuelve el cliente y modelo a usar para generación de imágenes.
 *
 * Prioridad:
 *   1. AZURE_IMAGE_ENDPOINT + AZURE_IMAGE_API_KEY  →  recurso imagen dedicado (Sweden Central)
 *   2. LLM_PROVIDER=azure                          →  recurso LLM principal (fallback)
 *   3. Cualquier otro                              →  OpenAI directo (OPENAI_API_KEY)
 */
function getImageClient(): { client: OpenAI | AzureOpenAI; model: string; isGptImage: boolean } {
  if (config.imageGen.endpoint && config.imageGen.apiKey) {
    const client = new AzureOpenAI({
      endpoint:   config.imageGen.endpoint,
      apiKey:     config.imageGen.apiKey,
      apiVersion: config.imageGen.apiVersion,
      deployment: config.imageGen.deployment,
    })
    const isGptImage = config.imageGen.deployment.startsWith('gpt-image')
    return { client, model: config.imageGen.deployment, isGptImage }
  }

  if (config.llm.provider === 'azure') {
    const client = new AzureOpenAI({
      endpoint:   config.llm.azure.endpoint,
      apiKey:     config.llm.azure.apiKey,
      apiVersion: config.llm.azure.apiVersion,
      deployment: config.llm.azure.deployments.dalle,
    })
    return { client, model: config.llm.azure.deployments.dalle, isGptImage: false }
  }

  return { client: new OpenAI(), model: 'dall-e-3', isGptImage: false }
}

/**
 * Genera una imagen para una historia y la sube a R2.
 * Retorna la URL pública de la imagen.
 *
 * Soporta tanto DALL-E 3 como gpt-image-2 (Azure AI Foundry).
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

  const { client, model, isGptImage } = getImageClient()

  log.info({ storyId, title: title.slice(0, 50), model }, 'generating image')

  const params: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    // gpt-image-2: 1536x1024  |  dall-e-3: 1792x1024
    size: isGptImage ? '1536x1024' : '1792x1024',
    // gpt-image-2: low/medium/high  |  dall-e-3: standard/hd
    quality: isGptImage ? config.imageGen.quality : 'standard',
  }

  // gpt-image-2 no soporta response_format — devuelve URL directamente
  if (!isGptImage) {
    params.response_format = 'b64_json'
  }

  const response = await (client.images.generate as (p: any) => Promise<any>)(params)

  let imageBuffer: Buffer

  if (isGptImage) {
    // gpt-image-2 devuelve URL temporal — descargar y subir a R2
    const imageUrl = response.data?.[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from gpt-image-2')
    const fetchRes = await fetch(imageUrl)
    if (!fetchRes.ok) throw new Error(`Failed to download generated image: ${fetchRes.status}`)
    const arrayBuffer = await fetchRes.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuffer)
  } else {
    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error('No image data returned from DALL-E')
    imageBuffer = Buffer.from(b64, 'base64')
  }
  const filename = `${storyId}-${Date.now()}.png`

  const publicUrl = await uploadImageToR2(imageBuffer, filename)

  log.info({ storyId, publicUrl, model }, 'story image generated and uploaded')
  return publicUrl
}
