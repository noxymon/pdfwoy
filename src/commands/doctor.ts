import { Command } from 'commander'
import { execSync } from 'node:child_process'
import chalk from 'chalk'
import { getPlatformInfo } from '../utils/platform.js'
import { fileExists, isExecutable } from '../utils/fs.js'
import { findOnPath } from '../utils/deps.js'

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check system dependencies and configuration')
    .action(() => {
      const info = getPlatformInfo()

      console.log(chalk.bold('\n  pdftools doctor\n'))

      const nodeOk = parseInt(process.version.slice(1), 10) >= 20
      console.log(
        `  Node.js     ${nodeOk ? chalk.green(process.version) : chalk.red(process.version + ' (need >=20)')}`,
      )
      console.log(
        `  Platform    ${process.platform}/${process.arch} ${info.supported ? chalk.green('supported') : chalk.red('unsupported')}`,
      )

      // Ghostscript resolution
      let gsStatus: string
      let gsHint: string

      if (fileExists(info.cachedGsPath) && isExecutable(info.cachedGsPath)) {
        const ver = getGsVersion(info.cachedGsPath)
        gsStatus = chalk.green(`✓ cached (${ver})`)
        gsHint = chalk.dim(`     └─ ${info.cachedGsPath}`)
      } else {
        const sysPath = findOnPath(info.gsBinaryName)
        if (sysPath) {
          const ver = getGsVersion(sysPath)
          gsStatus = chalk.green(`✓ PATH (${ver})`)
          gsHint = chalk.dim(`     └─ ${sysPath}`)
        } else {
          gsStatus = chalk.red('✗ missing')
          gsHint = chalk.dim('     └─ run: pdftools install-deps')
        }
      }

      console.log(`  Ghostscript ${gsStatus}`)
      console.log(gsHint)
      console.log(chalk.dim(`  Cache dir   ${info.cacheDir}`))
      console.log()
    })
}

function getGsVersion(gsPath: string): string {
  try {
    return execSync(`"${gsPath}" --version`, { stdio: 'pipe' }).toString().trim()
  } catch {
    return 'unknown'
  }
}
