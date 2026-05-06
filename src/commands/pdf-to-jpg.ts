import { Command } from 'commander'
import { pdf } from 'pdf-to-img'
import sharp from 'sharp'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolvePath, ensureDir, fileExists, basename, extname } from '../utils/fs.js'
import { log, spinner } from '../utils/logger.js'
import { UserError } from '../utils/deps.js'

interface PageSpec {
  type: 'single' | 'range' | 'openRange'
  n?: number
  start?: number
  end?: number
}

function parsePageSpecs(range: string): PageSpec[] {
  const specs: PageSpec[] = []
  for (const part of range.split(',')) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const dashIdx = trimmed.indexOf('-')
      const startStr = trimmed.slice(0, dashIdx)
      const endStr = trimmed.slice(dashIdx + 1)
      const start = parseInt(startStr, 10)
      if (isNaN(start)) continue
      if (endStr === '') {
        specs.push({ type: 'openRange', start })
      } else {
        const end = parseInt(endStr, 10)
        if (!isNaN(end)) specs.push({ type: 'range', start, end })
      }
    } else {
      const n = parseInt(trimmed, 10)
      if (!isNaN(n)) specs.push({ type: 'single', n })
    }
  }
  return specs
}

function pageMatches(pageNum: number, specs: PageSpec[]): boolean {
  return specs.some((s) => {
    if (s.type === 'single') return pageNum === s.n
    if (s.type === 'range') return pageNum >= (s.start ?? 1) && pageNum <= (s.end ?? pageNum)
    return pageNum >= (s.start ?? 1)
  })
}

export function pdfToJpgCommand(): Command {
  return new Command('jpg')
    .description('Convert PDF pages to JPEG images')
    .argument('<input>', 'input PDF file')
    .option('-o, --out <dir>', 'output directory (default: ./<name>-jpg)')
    .option('-d, --dpi <n>', 'render DPI', '150')
    .option('-q, --quality <n>', 'JPEG quality 1–100', '85')
    .option('-p, --pages <range>', 'page range e.g. "1-3,5,7-" (default: all)')
    .action(
      async (
        input: string,
        opts: { out?: string; dpi: string; quality: string; pages?: string },
      ) => {
        const inputPath = resolvePath(input)

        if (!fileExists(inputPath)) throw new UserError(`File not found: ${inputPath}`)
        if (extname(inputPath).toLowerCase() !== '.pdf')
          throw new UserError(`Not a PDF file: ${inputPath}`)

        const dpi = parseInt(opts.dpi, 10)
        const quality = parseInt(opts.quality, 10)
        if (isNaN(dpi) || dpi < 1) throw new UserError('--dpi must be a positive integer')
        if (isNaN(quality) || quality < 1 || quality > 100)
          throw new UserError('--quality must be 1–100')

        const stem = basename(inputPath, extname(inputPath))
        const outDir = opts.out ? resolvePath(opts.out) : join(process.cwd(), `${stem}-jpg`)
        ensureDir(outDir)

        const pageSpecs = opts.pages ? parsePageSpecs(opts.pages) : null
        const scale = dpi / 72

        const spin = spinner(`Opening ${basename(inputPath)}…`)
        let written = 0
        let total = 0

        try {
          const doc = await pdf(inputPath, { scale })

          for await (const image of doc) {
            total++
            if (pageSpecs && !pageMatches(total, pageSpecs)) continue

            const outFile = join(outDir, `page-${String(total).padStart(3, '0')}.jpg`)
            await sharp(image).jpeg({ quality }).toFile(outFile)
            written++
            spin.text = `Converting page ${total}…`
          }

          spin.succeed(
            `Done — ${written} page${written !== 1 ? 's' : ''} written to ${outDir}`,
          )
        } catch (err) {
          spin.fail('Conversion failed')
          throw err
        }
      },
    )
}
