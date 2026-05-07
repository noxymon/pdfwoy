import { execSync, spawn } from 'node:child_process'
import { createReadStream, createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { get as httpsGet } from 'node:https'
import { createHash } from 'node:crypto'
import chalk from 'chalk'
import prompts from 'prompts'
import { getPlatformInfo } from './platform.js'
import { fileExists, isExecutable } from './fs.js'
import { log } from './logger.js'

const GS_VERSION = '10.07.0'
const GS_RELEASE_TAG = 'gs10070'
const GS_INSTALLERS = {
  w32: {
    file: 'gs10070w32.exe',
    sha512:
      '8472a405b7ffad52a470e44003c8fcb43b36cced1d385048b6849f6f6b6f802e0a645ebb353fcb908d19cf75c0c4de31de5189c48c101ba030f2fd1ba31f0d64',
  },
  w64: {
    file: 'gs10070w64.exe',
    sha512:
      'ccee91cc0a7ae7b9413e7d3b4354a49530eae2ebb8e968d8af9115aaa02f6cea2efb10a86d6fc43597b50a18d0ba4c7bfa49a551ea485cab5f8ca26009be3f8b',
  },
} as const

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

  const promptMsg =
    info.platform === 'win32'
      ? `Download and install Ghostscript ${GS_VERSION} from Artifex (${pickWindowsInstaller(info.arch).file}, ~65 MB)?`
      : `Install Ghostscript via "${installCmd}"?`

  let shouldInstall = false
  if (interactive) {
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: promptMsg,
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
      `Ghostscript not found.\n\nInstall it:\n${info.installHint}\n\nOr run: pdfwoy install-deps`,
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
      return installViaArtifexInstaller()
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

function pickWindowsInstaller(arch: string): (typeof GS_INSTALLERS)[keyof typeof GS_INSTALLERS] {
  // arm64 has no native Artifex installer; the x64 build runs under emulation.
  return arch === 'ia32' ? GS_INSTALLERS.w32 : GS_INSTALLERS.w64
}

async function installViaArtifexInstaller(): Promise<string> {
  const info = getPlatformInfo()
  const installer = pickWindowsInstaller(info.arch)
  const url = `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/${GS_RELEASE_TAG}/${installer.file}`
  const downloadPath = join(info.binDir, installer.file)

  log.info(`Downloading Ghostscript ${GS_VERSION} (${installer.file})…`)
  try {
    await downloadFile(url, downloadPath)
  } catch (err) {
    throw new UserError(
      `Failed to download Ghostscript installer.\n${(err as Error).message}\n\nManual install:\n${info.installHint}`,
    )
  }

  log.info('Verifying download…')
  const actualHash = await sha512File(downloadPath)
  if (actualHash !== installer.sha512) {
    safeUnlink(downloadPath)
    throw new UserError(
      `Ghostscript installer hash mismatch — refusing to run.\n  expected: ${installer.sha512}\n  actual:   ${actualHash}\n\nManual install:\n${info.installHint}`,
    )
  }

  log.info(`Running installer (silent) → ${info.gsInstallDir}`)
  // NSIS: /S = silent, /D=<path> must be the last argument and unquoted.
  // windowsVerbatimArguments prevents Node from quoting the path.
  await runInstaller(downloadPath, ['/S', `/D=${info.gsInstallDir}`])
  safeUnlink(downloadPath)

  if (!fileExists(info.cachedGsPath)) {
    throw new Error(
      `Installer finished but ${info.gsBinaryName} not found at ${info.cachedGsPath}.\nManual install:\n${info.installHint}`,
    )
  }
  return info.cachedGsPath
}

function downloadFile(url: string, dest: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects'))
          return
        }
        downloadFile(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject)
        return
      }
      if (status !== 200) {
        res.resume()
        reject(new Error(`HTTP ${status} for ${url}`))
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())))
      file.on('error', (err) => {
        safeUnlink(dest)
        reject(err)
      })
      res.on('error', (err) => {
        safeUnlink(dest)
        reject(err)
      })
    })
    req.on('error', reject)
  })
}

function sha512File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const rs = createReadStream(path)
    rs.on('data', (chunk) => hash.update(chunk))
    rs.on('end', () => resolve(hash.digest('hex')))
    rs.on('error', reject)
  })
}

function runInstaller(exe: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, {
      stdio: 'inherit',
      windowsVerbatimArguments: true,
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Installer exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

function safeUnlink(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // ignore
  }
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
