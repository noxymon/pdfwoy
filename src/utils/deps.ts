import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import chalk from 'chalk'
import prompts from 'prompts'
import { getPlatformInfo } from './platform.js'
import { fileExists, isExecutable } from './fs.js'
import { log } from './logger.js'

// Commands that require Ghostscript to be installed
const GS_REQUIRED_COMMANDS = new Set(['compress'])

/**
 * Called via preAction hook before any command runs.
 * Checks required deps for the command; prompts to install if missing.
 * Exits process with code 1 if user declines.
 */
export async function startupDepCheck(commandName: string): Promise<void> {
  if (!GS_REQUIRED_COMMANDS.has(commandName)) return

  const info = getPlatformInfo()
  const gsAvailable =
    (fileExists(info.cachedGsPath) && isExecutable(info.cachedGsPath)) ||
    !!findOnPath(info.gsBinaryName)

  if (gsAvailable) return

  // Show dep check banner only when something is missing
  console.log(chalk.bold('\n  Checking dependencies…\n'))
  console.log(`  Ghostscript  ${chalk.red('✗ missing')}\n`)

  if (!info.canAutoInstall) {
    console.error(chalk.red('Ghostscript is required.\n'))
    console.error(`${info.installHint}\n`)
    console.error(chalk.dim('Then run `pdfwoy doctor` to verify.\n'))
    process.exit(1)
  }

  const installCmd = info.packageManagerCmd ?? info.installHint.split('\n')[0]
  const interactive = process.stdin.isTTY

  let shouldInstall = false
  if (interactive) {
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Install Ghostscript via "${installCmd}"?`,
      initial: true,
    })
    // prompts returns {} if user ctrl-c
    shouldInstall = response.confirm === true
  }

  if (!shouldInstall) {
    console.error(chalk.red('\nGhostscript required. Exiting.\n'))
    console.error(chalk.dim(`Manual install:\n${info.installHint}\n`))
    process.exit(1)
  }

  console.log()
  await installGhostscript()
  console.log()
}

export class UserError extends Error {
  readonly isUserError = true as const
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

export interface ResolveOptions {
  autoInstall?: boolean
  interactive?: boolean
  yes?: boolean
}

export async function resolveGhostscript(opts: ResolveOptions = {}): Promise<string> {
  const info = getPlatformInfo()

  // 1. Cached binary
  if (fileExists(info.cachedGsPath) && isExecutable(info.cachedGsPath)) {
    return info.cachedGsPath
  }

  // 2. System PATH
  const systemPath = findOnPath(info.gsBinaryName)
  if (systemPath) return systemPath

  // 3. Not found
  if (!opts.autoInstall || !info.canAutoInstall) {
    throw new UserError(
      `Ghostscript not found.\n\n${info.installHint}${info.canAutoInstall ? '\n\nOr run: pdfwoy install-deps' : ''}`,
    )
  }

  if (opts.interactive && !opts.yes) {
    const installCmd = info.packageManagerCmd ?? info.installHint.split('\n')[0]
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Ghostscript not found. Install via "${installCmd}"?`,
      initial: false,
    })
    if (!response.confirm) {
      throw new UserError(`Ghostscript required.\n\n${info.installHint}`)
    }
  }

  return installGhostscript()
}

export function findOnPath(binary: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${binary}` : `which ${binary}`
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim()
    const first = result.split('\n')[0]?.trim()
    return first || null
  } catch {
    return null
  }
}

export async function installGhostscript(): Promise<string> {
  const info = getPlatformInfo()

  if (!info.canAutoInstall) {
    throw new UserError(`Auto-install is not supported on ${info.platform}.\n\n${info.installHint}`)
  }

  mkdirSync(info.binDir, { recursive: true })

  switch (info.platform) {
    case 'darwin':
      return installViaBrew()
    case 'linux':
      return installViaLinuxPackageManager()
    default:
      throw new UserError(`Auto-install unsupported on ${info.platform}.\n${info.installHint}`)
  }
}

async function installViaBrew(): Promise<string> {
  if (!findOnPath('brew')) {
    throw new UserError(
      'Homebrew not found. Install it from https://brew.sh then run: brew install ghostscript',
    )
  }
  log.info('Installing Ghostscript via Homebrew…')
  await spawnCommand('brew', ['install', 'ghostscript'])
  const path = findOnPath('gs')
  if (!path) throw new Error('brew install succeeded but `gs` not found on PATH')
  return path
}

async function installViaLinuxPackageManager(): Promise<string> {
  const managers = [
    { cmd: 'apt-get', args: ['install', '-y', 'ghostscript'] },
    { cmd: 'dnf', args: ['install', '-y', 'ghostscript'] },
    { cmd: 'yum', args: ['install', '-y', 'ghostscript'] },
  ]

  for (const mgr of managers) {
    if (findOnPath(mgr.cmd)) {
      log.info(`Installing Ghostscript via ${mgr.cmd}…`)
      await spawnCommand('sudo', [mgr.cmd, ...mgr.args])
      const path = findOnPath('gs')
      if (!path) throw new Error(`${mgr.cmd} install succeeded but \`gs\` not found on PATH`)
      return path
    }
  }

  throw new UserError(
    `No supported package manager found.\nManual install:\n${getPlatformInfo().installHint}`,
  )
}

function spawnCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}
