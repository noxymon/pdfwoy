import {
  existsSync,
  mkdirSync,
  statSync,
  accessSync,
  constants,
} from 'node:fs'
import {
  resolve,
  basename,
  dirname,
  extname,
} from 'node:path'

export function resolvePath(p: string): string {
  return resolve(process.cwd(), p)
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function fileSize(p: string): number {
  return statSync(p).size
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export { basename, dirname, extname, resolve }
