import { Command } from 'commander'
import chalk from 'chalk'
import { installGhostscript, UserError } from '../utils/deps.js'
import { log } from '../utils/logger.js'
import { getPlatformInfo } from '../utils/platform.js'

export function installDepsCommand(): Command {
  return new Command('install-deps')
    .description('Install system dependencies (Ghostscript)')
    .option('--yes', 'skip confirmation prompts (for CI / non-interactive use)')
    .action(async (_opts: { yes?: boolean }) => {
      const info = getPlatformInfo()

      if (!info.supported) {
        throw new UserError(
          `Platform ${info.platform}/${info.arch} not supported for auto-install.\n\nManual install:\n${info.installHint}`,
        )
      }

      if (!info.canAutoInstall) {
        throw new UserError(
          `Auto-install is not supported on ${info.platform}.\n\n${info.installHint}`,
        )
      }

      console.log(chalk.bold('\n  Installing dependencies…\n'))

      try {
        const gsPath = await installGhostscript()
        log.success(`Ghostscript ready → ${gsPath}`)
        console.log(chalk.dim('\n  Run `pdfwoy doctor` to verify.\n'))
      } catch (err) {
        if (err instanceof UserError) throw err
        throw new Error(`Installation failed: ${(err as Error).message}`)
      }
    })
}
