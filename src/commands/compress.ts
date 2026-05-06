import { Command } from 'commander'
import { join } from 'node:path'
import {
  resolvePath,
  fileExists,
  fileSize,
  formatBytes,
  basename,
  extname,
} from '../utils/fs.js'
import { log, spinner } from '../utils/logger.js'
import { resolveGhostscript, UserError } from '../utils/deps.js'
import { runGhostscript, type CompressLevel } from '../utils/ghostscript.js'

const VALID_LEVELS: CompressLevel[] = ['screen', 'ebook', 'printer', 'prepress']

export function compressCommand(): Command {
  return new Command('compress')
    .description('Compress a PDF using Ghostscript')
    .argument('<input>', 'input PDF file')
    .option('-o, --out <file>', 'output PDF path (default: <name>.compressed.pdf)')
    .option(
      '-l, --level <preset>',
      `compression preset: ${VALID_LEVELS.join('|')}`,
      'ebook',
    )
    .action(
      async (input: string, opts: { out?: string; level: string }) => {
        if (!VALID_LEVELS.includes(opts.level as CompressLevel)) {
          throw new UserError(
            `Invalid --level "${opts.level}". Must be one of: ${VALID_LEVELS.join(', ')}`,
          )
        }

        const inputPath = resolvePath(input)
        if (!fileExists(inputPath)) throw new UserError(`File not found: ${inputPath}`)
        if (extname(inputPath).toLowerCase() !== '.pdf')
          throw new UserError(`Not a PDF file: ${inputPath}`)

        const stem = basename(inputPath, extname(inputPath))
        const outPath = opts.out
          ? resolvePath(opts.out)
          : join(process.cwd(), `${stem}.compressed.pdf`)

        const gsPath = await resolveGhostscript()

        const sizeBefore = fileSize(inputPath)
        const spin = spinner(
          `Compressing ${basename(inputPath)} [${opts.level}]…`,
        )

        try {
          await runGhostscript({
            gsPath,
            input: inputPath,
            output: outPath,
            level: opts.level as CompressLevel,
          })

          const sizeAfter = fileSize(outPath)
          const pct = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1)
          const sign = sizeAfter < sizeBefore ? '−' : '+'

          spin.succeed(
            `${formatBytes(sizeBefore)} → ${formatBytes(sizeAfter)} (${sign}${Math.abs(parseFloat(pct))}%)`,
          )
          log.info(`Output: ${outPath}`)
        } catch (err) {
          spin.fail('Compression failed')
          throw err
        }
      },
    )
}
