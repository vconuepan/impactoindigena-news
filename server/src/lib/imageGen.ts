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
  options: { orientation?: 'portrait' | 'landscape' } = {},
): Promise<string> {
  // portrait (default): Instagram 4:5 carousel. landscape: website story hero.
  const orientation = options.orientation ?? 'portrait'
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
    // Portrait fills the 4:5 Instagram carousel with minimal upscaling/crop
    // (a landscape source had to be stretched ~2.6x vertically → blurry).
    // Landscape suits the website's wide story hero (max-height 480px).
    // gpt-image-2: 1024x1536 / 1536x1024  |  dall-e-3: 1024x1792 / 1792x1024
    size: orientation === 'portrait'
      ? (isGptImage ? '1024x1536' : '1024x1792')
      : (isGptImage ? '1536x1024' : '1792x1024'),
    // gpt-image-2: low/medium/high  |  dall-e-3: standard/hd
    quality: isGptImage ? config.imageGen.quality : 'standard',
  }

  // gpt-image-2 no acepta response_format — devuelve b64_json por defecto en Azure
  // dall-e-3 sí lo acepta y requiere especificarlo para obtener base64
  if (!isGptImage) {
    params.response_format = 'b64_json'
  }

  const response = await (client.images.generate as (p: any) => Promise<any>)(params)

  let imageBuffer: Buffer

  const item = response.data?.[0]
  if (!item) throw new Error('No image data in response')

  if (item.b64_json) {
    // Azure gpt-image-2 y DALL-E 3 devuelven base64
    imageBuffer = Buffer.from(item.b64_json, 'base64')
  } else if (item.url) {
    // Algunos endpoints devuelven URL temporal — descargar
    const fetchRes = await fetch(item.url)
    if (!fetchRes.ok) throw new Error(`Failed to download generated image: ${fetchRes.status}`)
    imageBuffer = Buffer.from(await fetchRes.arrayBuffer())
  } else {
    throw new Error('No image data (neither b64_json nor url) in response')
  }
  const filename = `${storyId}-${Date.now()}.png`

  const publicUrl = await uploadImageToR2(imageBuffer, filename)

  log.info({ storyId, publicUrl, model }, 'story image generated and uploaded')
  return publicUrl
}
