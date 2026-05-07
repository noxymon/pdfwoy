#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { pdfToJpgCommand } from './commands/pdf-to-jpg.js'
import { compressCommand } from './commands/compress.js'
import { doctorCommand } from './commands/doctor.js'
import { installDepsCommand } from './commands/install-deps.js'
import { UserError, startupDepCheck } from './utils/deps.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let version = '0.1.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
    version: string
  }
  version = pkg.version
} catch {}

const program = new Command()

program
  .name('pdfwoy')
  .description('PDF utilities: convert to JPG, compress, and more')
  .version(version)

program.addCommand(pdfToJpgCommand())
program.addCommand(compressCommand())
program.addCommand(doctorCommand())
program.addCommand(installDepsCommand())

// Dep check runs before any command action
program.hook('preAction', async (_, actionCommand) => {
  await startupDepCheck(actionCommand.name())
})

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof UserError) {
    console.error(chalk.red('\nError:'), err.message)
    process.exit(1)
  }
  console.error(chalk.red('\nUnexpected error:'), err instanceof Error ? err.message : String(err))
  if (err instanceof Error && err.stack) {
    console.error(chalk.dim(err.stack.split('\n').slice(1).join('\n')))
  }
  process.exit(2)
})
