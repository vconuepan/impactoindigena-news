import OpenAI from 'openai'
import { createLogger } from './logger.js'
import { uploadImageToR2 } from './imageStorage.js'

const log = createLogger('image-gen')

// DALL-E 3 usa siempre OpenAI directo (OPENAI_API_KEY).
// Azure OpenAI tiene cuotas muy limitadas para DALL-E y no está disponible
// en todas las regiones — el resto de los servicios (LLM, embeddings, TTS)
// usan Azure vía LLM_PROVIDER=azure.
const openai = new OpenAI()

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

  log.info({ storyId, title: title.slice(0, 50) }, 'generating DALL-E image')

  const response = await openai.images.generate({
    model: 'dall-e-3',
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
