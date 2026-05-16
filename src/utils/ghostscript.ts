import { spawn } from 'node:child_process'

export type CompressLevel = 'screen' | 'ebook' | 'printer' | 'prepress'

export interface GhostscriptOptions {
  gsPath: string
  input: string | string[]
  output: string
  level?: CompressLevel
}

export function runGhostscript(opts: GhostscriptOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${opts.output}`,
    ]

    if (opts.level) {
      args.push(`-dPDFSETTINGS=/${opts.level}`)
    }

    if (Array.isArray(opts.input)) {
      args.push(...opts.input)
    } else {
      args.push(opts.input)
    }

    const proc = spawn(opts.gsPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const errChunks: Buffer[] = []

    proc.stderr?.on('data', (chunk: Buffer) => errChunks.push(chunk))

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const msg = Buffer.concat(errChunks).toString().trim()
        reject(new Error(`Ghostscript exited ${code}${msg ? `: ${msg}` : ''}`))
      }
    })

    proc.on('error', reject)
  })
}
