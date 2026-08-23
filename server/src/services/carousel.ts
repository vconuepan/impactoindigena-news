import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import PDFDocument from 'pdfkit'
import archiver from 'archiver'
import { createWriteStream, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = join(__dirname, '..', '..', 'assets')

// Image dimensions (matching PHP version)
const WIDTH = 1200
const HEIGHT = 675
const PADDING = 50
const HEADER_HEIGHT = 80

export interface CarouselStory {
  title: string
  category: string
  summary: string
  publisher: string
  date: string | null
}

function registerFonts() {
  const boldPath = join(ASSETS_DIR, 'fonts', 'Inter-Bold.ttf')
  const regularPath = join(ASSETS_DIR, 'fonts', 'Inter-Regular.ttf')
  if (existsSync(boldPath)) {
    GlobalFonts.registerFromPath(boldPath, 'InterBold')
  }
  if (existsSync(regularPath)) {
    GlobalFonts.registerFromPath(regularPath, 'InterRegular')
  }
}

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

export function createStoryImage(story: CarouselStory): Buffer {
  registerFonts()

  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Header bar (colored rectangle)
  ctx.fillStyle = '#2563eb'
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT)

  // Header text (category name on the header)
  ctx.fillStyle = '#ffffff'
  ctx.font = '24px InterBold, Arial, sans-serif'
  ctx.fillText(story.category.toUpperCase(), PADDING, HEADER_HEIGHT / 2 + 8)

  // Content area starts below header
  let currentY = HEADER_HEIGHT + PADDING

  // Category text
  ctx.fillStyle = '#6b7280'
  ctx.font = '15px InterRegular, Arial, sans-serif'
  ctx.fillText(story.category, PADDING, currentY)
  currentY += 25

  // Title (bold, word-wrapped)
  ctx.fillStyle = '#000000'
  ctx.font = '30px InterBold, Arial, sans-serif'
  const titleLines = wrapText(ctx, story.title, WIDTH - PADDING * 2)
  for (const line of titleLines) {
    ctx.fillText(line, PADDING, currentY)
    currentY += 42
  }
  currentY += 10

  // Publisher + date
  ctx.fillStyle = '#374151'
  ctx.font = '20px InterRegular, Arial, sans-serif'
  let publisherText = story.publisher
  if (story.date) {
    try {
      const d = new Date(story.date)
      if (d.getTime() > 0) {
        const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        publisherText += `, ${formatted}`
      }
    } catch {
      // Ignore invalid dates
    }
  }
  ctx.fillText(publisherText, PADDING, currentY)
  currentY += 35

  // Summary (word-wrapped)
  ctx.fillStyle = '#374151'
  ctx.font = '20px InterRegular, Arial, sans-serif'
  const summaryLines = wrapText(ctx, story.summary, WIDTH - PADDING * 2)
  for (const line of summaryLines) {
    if (currentY > HEIGHT - PADDING - 80) break // Leave room for logo area
    ctx.fillText(line, PADDING, currentY)
    currentY += 30
  }

  // Logo placeholder (bottom-right)
  ctx.fillStyle = '#9ca3af'
  ctx.font = '14px InterRegular, Arial, sans-serif'
  ctx.fillText('vocesindigenas.org', WIDTH - PADDING / 2 - 160, HEIGHT - PADDING / 2 - 10)

  return canvas.toBuffer('image/png')
}

export async function generateCarouselZip(
  stories: CarouselStory[],
  outputDir: string,
): Promise<string> {
  mkdirSync(outputDir, { recursive: true })

  const imagePaths: string[] = []

  // Generate PNG images
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i]
    const buffer = createStoryImage(story)
    const filename = `${String(i + 1).padStart(2, '0')}_${story.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}.png`
    const filepath = join(outputDir, filename)
    const fs = await import('fs/promises')
    await fs.writeFile(filepath, buffer)
    imagePaths.push(filepath)
  }

  // Generate PDF
  const pdfPath = join(outputDir, 'carousel_images.pdf')
  await generatePdf(imagePaths, pdfPath)

  // Create ZIP
  const zipPath = join(outputDir, 'carousel_images.zip')
  await createZip([...imagePaths, pdfPath], zipPath)

  // Clean up individual images and PDF
  for (const imagePath of imagePaths) {
    try { unlinkSync(imagePath) } catch { /* ignore */ }
  }
  try { unlinkSync(pdfPath) } catch { /* ignore */ }

  return zipPath
}

function generatePdf(imagePaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      layout: 'landscape',
      size: [HEIGHT, WIDTH], // PDFKit uses [width, height] but landscape flips them
      margin: 0,
      autoFirstPage: false,
    })

    const stream = createWriteStream(outputPath)
    doc.pipe(stream)

    for (const imagePath of imagePaths) {
      doc.addPage({ size: [WIDTH, HEIGHT], margin: 0 })
      doc.image(imagePath, 0, 0, { width: WIDTH, height: HEIGHT })
    }

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}

function createZip(filePaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    archive.on('error', reject)

    archive.pipe(output)

    for (const filePath of filePaths) {
      const name = filePath.split(/[/\\]/).pop()!
      archive.file(filePath, { name })
    }

    archive.finalize()
  })
}
