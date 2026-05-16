import { Command } from 'commander'
import {
  resolvePath,
  fileExists,
  extname,
} from '../utils/fs.js'
import { spinner } from '../utils/logger.js'
import { resolveGhostscript, UserError } from '../utils/deps.js'
import { runGhostscript } from '../utils/ghostscript.js'
import chalk from 'chalk'

export function mergeCommand(): Command {
  return new Command('merge')
    .description('Merge multiple PDF files into one')
    .argument('<files...>', 'input PDF files')
    .requiredOption('-o, --out <file>', 'output PDF path')
    .action(
      async (files: string[], opts: { out: string }) => {
        if (files.length < 2) {
          throw new UserError('Provide at least two files to merge.')
        }

        const inputPaths = files.map(f => resolvePath(f))
        for (const inputPath of inputPaths) {
          if (!fileExists(inputPath)) {
            throw new UserError(`File not found: ${inputPath}`)
          }
          if (extname(inputPath).toLowerCase() !== '.pdf') {
            throw new UserError(`Not a PDF file: ${inputPath}`)
          }
        }

        const outPath = resolvePath(opts.out)
        const gsPath = await resolveGhostscript()

        const spin = spinner(`Merging ${files.length} PDFs…`)

        try {
          await runGhostscript({
            gsPath,
            input: inputPaths,
            output: outPath,
          })

          spin.succeed(chalk.green(`Successfully merged into ${opts.out}`))
        } catch (err) {
          spin.fail('Merge failed')
          throw err
        }
      },
    )
}
