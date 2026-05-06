import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
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

  if (!info.supported) {
    console.error(chalk.red('Auto-install not supported on this platform.\n'))
    console.error(`Manual install:\n${info.installHint}`)
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
  if (!opts.autoInstall) {
    throw new UserError(
      `Ghostscript not found.\n\nInstall it:\n${info.installHint}\n\nOr run: pdftools install-deps`,
    )
  }

  if (!info.supported) {
    throw new UserError(
      `Platform ${info.platform}/${info.arch} not supported for auto-install.\n\nManual install:\n${info.installHint}`,
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
      throw new UserError(`Ghostscript required.\n\nManual install:\n${info.installHint}`)
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

  mkdirSync(info.binDir, { recursive: true })

  switch (info.platform) {
    case 'darwin':
      return installViaBrew()
    case 'linux':
      return installViaLinuxPackageManager()
    case 'win32':
      return installViaWinget()
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

async function installViaWinget(): Promise<string> {
  if (!findOnPath('winget')) {
    throw new UserError(
      'winget not found. Download Ghostscript from:\nhttps://www.ghostscript.com/releases/gsdnld.html',
    )
  }
  log.info('Installing Ghostscript via winget…')
  await spawnCommand('winget', ['install', 'ArtifexSoftware.GhostScript', '--silent'])
  const path = findOnPath('gswin64c.exe')
  if (!path) throw new Error('winget install succeeded but gswin64c.exe not found on PATH')
  return path
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
