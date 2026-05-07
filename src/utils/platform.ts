import { homedir } from 'node:os'
import { join } from 'node:path'

export type SupportedPlatform = 'darwin' | 'linux' | 'win32'
export type SupportedArch = 'x64' | 'arm64'

export interface PlatformInfo {
  platform: string
  arch: string
  supported: boolean
  gsBinaryName: string
  cacheDir: string
  binDir: string
  gsInstallDir: string
  cachedGsPath: string
  installHint: string
  packageManagerCmd: string | null
}

export function getPlatformInfo(): PlatformInfo {
  const platform = process.platform
  const arch = process.arch
  const supported =
    ['darwin', 'linux', 'win32'].includes(platform) &&
    ['x64', 'arm64', 'ia32'].includes(arch)

  const gsBinaryName = platform === 'win32' ? 'gswin64c.exe' : 'gs'
  const cacheDir = join(homedir(), '.pdfwoy')
  const binDir = join(cacheDir, 'bin')
  const gsInstallDir = platform === 'win32' ? join(cacheDir, 'ghostscript') : binDir
  const cachedGsPath =
    platform === 'win32' ? join(gsInstallDir, 'bin', gsBinaryName) : join(binDir, gsBinaryName)

  return {
    platform,
    arch,
    supported,
    gsBinaryName,
    cacheDir,
    binDir,
    gsInstallDir,
    cachedGsPath,
    installHint: getInstallHint(platform),
    packageManagerCmd: getPackageManagerCmd(platform),
  }
}

function getInstallHint(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'brew install ghostscript'
    case 'linux':
      return [
        'sudo apt-get install ghostscript   # Debian/Ubuntu',
        'sudo dnf install ghostscript       # Fedora/RHEL',
        'sudo yum install ghostscript       # CentOS',
      ].join('\n')
    case 'win32':
      return 'Download installer: https://github.com/ArtifexSoftware/ghostpdl-downloads/releases'
    default:
      return 'https://www.ghostscript.com/releases/gsdnld.html'
  }
}

function getPackageManagerCmd(platform: string): string | null {
  switch (platform) {
    case 'darwin':
      return 'brew install ghostscript'
    case 'win32':
      return 'download Ghostscript installer from github.com/ArtifexSoftware'
    default:
      return null
  }
}
