import OpenAI, { AzureOpenAI } from 'openai'
import { config } from '../config.js'
import { createLogger } from './logger.js'
import { uploadImageToR2 } from './imageStorage.js'
import { normalizar } from './imagen-normalizar.js'

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
    // Landscape (hero del sitio, se ve grande) usa calidad alta; portrait (redes que
    // recomprimen al subir) usa la calidad reducida → mismo resultado visible, menos costo.
    quality: isGptImage
      ? (orientation === 'portrait' ? config.imageGen.qualityPortrait : config.imageGen.quality)
      : 'standard',
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
  // El modelo devuelve PNG, que para una fotografia es el peor formato posible:
  // guarda cada pixel sin compresion con perdida. Medido el 5-sep-2026 sobre la
  // portada en movil, cuatro de estos heroes pesaban 9,37 de los 11,09 MB de
  // imagenes de la pagina — 2,5 MB cada uno, a 1536x1024, para mostrarse a 480 px
  // de alto. Recomprimidos a JPEG 1200 px quedan en ~200 KB, un 92% menos, sin
  // diferencia visible.
  //
  // Es el mismo arreglo que ya llevaba `storyCard.ts` para las imagenes
  // rehospedadas; este camino, el de las generadas, habia quedado fuera y seguia
  // subiendo originales. Ahora ambos comparten `imagen-normalizar.ts` para que no
  // vuelvan a divergir.
  const normalizada = await normalizar(imageBuffer)
  const filename = `${storyId}-${Date.now()}.${normalizada ? 'jpg' : 'png'}`

  const publicUrl = normalizada
    ? await uploadImageToR2(normalizada, filename, 'image/jpeg')
    : await uploadImageToR2(imageBuffer, filename)

  log.info(
    { storyId, publicUrl, model, bytesOriginal: imageBuffer.length, bytesSubidos: (normalizada || imageBuffer).length },
    'story image generated and uploaded',
  )
  return publicUrl
}
