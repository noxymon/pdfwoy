import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const NODE = process.execPath
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = join(__dirname, '../dist/cli.js')
const FIXTURES_DIR = join(__dirname, 'fixtures')
const FIXTURE = join(FIXTURES_DIR, 'test.pdf')
const TMP = join(tmpdir(), `pdftools-test-${Date.now()}`)

// ── helpers ───────────────────────────────────────────────────────────────────

function run(
  args: string[],
  env?: Record<string, string>,
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(NODE, [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function tmp(name: string): string {
  const p = join(TMP, name)
  mkdirSync(p, { recursive: true })
  return p
}

function jpegMagic(filePath: string): string {
  const buf = readFileSync(filePath)
  return buf.subarray(0, 2).toString('hex')
}

function pdfHeader(filePath: string): string {
  return readFileSync(filePath, 'ascii').slice(0, 5)
}

function fileBytes(filePath: string): number {
  return statSync(filePath).size
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
  mkdirSync(FIXTURES_DIR, { recursive: true })

  // Generate test fixture PDF from PostScript via gs
  const psFile = join(TMP, 'fixture.ps')
  writeFileSync(
    psFile,
    [
      '%!PS',
      '/Helvetica findfont 14 scalefont setfont',
      '72 720 moveto',
      '(pdftools integration test) show',
      'showpage',
    ].join('\n'),
  )

  const gs = spawnSync(
    'gs',
    ['-sDEVICE=pdfwrite', `-sOutputFile=${FIXTURE}`, '-dNOPAUSE', '-dBATCH', '-dQUIET', psFile],
    { encoding: 'utf-8' },
  )

  if (gs.status !== 0) {
    throw new Error(`Failed to generate test fixture: ${gs.stderr}`)
  }
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

// ── basics ────────────────────────────────────────────────────────────────────

describe('basics', () => {
  it('--version exits 0 and prints version', () => {
    const r = run(['--version'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/)
  })

  it('--help exits 0 and lists commands', () => {
    const r = run(['--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('jpg')
    expect(r.stdout).toContain('compress')
    expect(r.stdout).toContain('doctor')
    expect(r.stdout).toContain('install-deps')
  })

  it('doctor exits 0', () => {
    const r = run(['doctor'])
    expect(r.status).toBe(0)
  })
})

// ── jpg ───────────────────────────────────────────────────────────────────────

describe('jpg', () => {
  it('converts PDF to JPEG and exits 0', () => {
    const out = tmp('jpg-default')
    const r = run(['jpg', FIXTURE, '-o', out])
    expect(r.status).toBe(0)
    expect(existsSync(join(out, 'page-001.jpg'))).toBe(true)
  })

  it('output file has JPEG magic bytes (ffd8)', () => {
    const out = tmp('jpg-magic')
    run(['jpg', FIXTURE, '-o', out])
    expect(jpegMagic(join(out, 'page-001.jpg'))).toBe('ffd8')
  })

  it('page range -p 1 writes exactly 1 file', () => {
    const out = tmp('jpg-p1')
    const r = run(['jpg', FIXTURE, '-p', '1', '-o', out])
    expect(r.status).toBe(0)
    const files = readdirSync(out).filter((f) => f.endsWith('.jpg'))
    expect(files).toHaveLength(1)
  })

  it('higher DPI produces larger file', () => {
    const hi = tmp('jpg-300dpi')
    const lo = tmp('jpg-72dpi')
    run(['jpg', FIXTURE, '-d', '300', '-o', hi])
    run(['jpg', FIXTURE, '-d', '72', '-o', lo])
    expect(fileBytes(join(hi, 'page-001.jpg'))).toBeGreaterThan(
      fileBytes(join(lo, 'page-001.jpg')),
    )
  })

  it('higher quality produces larger file', () => {
    const q90 = tmp('jpg-q90')
    const q10 = tmp('jpg-q10')
    run(['jpg', FIXTURE, '-q', '90', '-o', q90])
    run(['jpg', FIXTURE, '-q', '10', '-o', q10])
    expect(fileBytes(join(q90, 'page-001.jpg'))).toBeGreaterThan(
      fileBytes(join(q10, 'page-001.jpg')),
    )
  })
})

// ── compress ──────────────────────────────────────────────────────────────────

describe('compress', () => {
  it('compresses PDF and exits 0', () => {
    const out = join(TMP, 'compressed.pdf')
    const r = run(['compress', FIXTURE, '-o', out])
    expect(r.status).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it('output is a valid PDF (starts with %PDF-)', () => {
    const out = join(TMP, 'compressed-header.pdf')
    run(['compress', FIXTURE, '-o', out])
    expect(pdfHeader(out)).toBe('%PDF-')
  })

  it.each(['screen', 'ebook', 'printer', 'prepress'] as const)(
    'compression level "%s" exits 0',
    (level) => {
      const out = join(TMP, `compressed-${level}.pdf`)
      const r = run(['compress', FIXTURE, '-l', level, '-o', out])
      expect(r.status).toBe(0)
    },
  )
})

// ── error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('jpg: nonexistent file exits 1', () => {
    expect(run(['jpg', '/nonexistent.pdf']).status).toBe(1)
  })

  it('compress: nonexistent file exits 1', () => {
    expect(run(['compress', '/nonexistent.pdf']).status).toBe(1)
  })

  it('jpg: non-.pdf extension exits 1', () => {
    const fake = join(TMP, 'not-a-pdf.txt')
    writeFileSync(fake, 'not a pdf')
    expect(run(['jpg', fake]).status).toBe(1)
  })

  it('compress: non-.pdf extension exits 1', () => {
    const fake = join(TMP, 'not-a-pdf.txt')
    writeFileSync(fake, 'not a pdf')
    expect(run(['compress', fake]).status).toBe(1)
  })

  it('compress: invalid --level exits 1', () => {
    expect(run(['compress', FIXTURE, '-l', 'ultra']).status).toBe(1)
  })
})

// ── startup dep check ─────────────────────────────────────────────────────────

describe('startup dep check', () => {
  let fakeBin: string
  let noGsPath: string

  beforeAll(() => {
    // Create a fake 'which' that returns failure for 'gs' only
    fakeBin = join(TMP, 'fake-bin')
    mkdirSync(fakeBin, { recursive: true })
    writeFileSync(
      join(fakeBin, 'which'),
      '#!/bin/sh\n[ "$1" = "gs" ] && exit 1\nexec /usr/bin/which "$@"\n',
    )
    chmodSync(join(fakeBin, 'which'), 0o755)
    // Include node's own directory so child processes can find node if needed
    const nodeBinDir = dirname(NODE)
    noGsPath = `${fakeBin}:${nodeBinDir}:/usr/local/bin:/usr/bin:/bin`
  })

  it('compress exits 1 when gs not on PATH (non-interactive)', () => {
    const r = run(['compress', FIXTURE, '-o', '/dev/null'], { PATH: noGsPath })
    expect(r.status).toBe(1)
  })

  it('compress stderr mentions "missing" or "Ghostscript" when gs absent', () => {
    const r = run(['compress', FIXTURE, '-o', '/dev/null'], { PATH: noGsPath })
    const combined = r.stdout + r.stderr
    expect(combined.toLowerCase()).toMatch(/missing|ghostscript/)
  })

  it('jpg succeeds with gs hidden (no dep check for jpg)', () => {
    const out = tmp('jpg-no-gs')
    const r = run(['jpg', FIXTURE, '-o', out], { PATH: noGsPath })
    expect(r.status).toBe(0)
    expect(existsSync(join(out, 'page-001.jpg'))).toBe(true)
  })
})
