# pdfwoy

A local-first PDF utility CLI. Convert PDFs to JPG and compress them — without uploading a single page to a stranger's server.

## Why this exists

Most PDF tools today live on the web. You drag your file into a browser, the site quietly uploads it to someone else's machine, runs whatever it runs, and hands a result back. That workflow is convenient — and it's a privacy problem.

Anything you put through one of those sites is, by definition, leaving your computer. Bank statements, contracts, medical forms, ID scans, NDAs, tax returns — the documents people most often need to compress or convert are exactly the documents you should *not* be uploading to a third party. Even when a service promises to delete files after an hour, you have no way to verify it, and you have no idea what's logged in between.

`pdfwoy` exists to do the same boring jobs entirely on your own machine. Nothing leaves your disk.

## Install

```bash
npm install -g pdfwoy
```

Requires Node.js 20+. The `compress` command additionally needs [Ghostscript](https://www.ghostscript.com/) on PATH; running `pdfwoy install-deps` will set it up for you (uses Homebrew on macOS, apt/dnf/yum on Linux, winget on Windows).

Verify your setup:

```bash
pdfwoy doctor
```

## Usage

### Convert a PDF to JPG images

```bash
pdfwoy jpg input.pdf
```

Writes one JPEG per page into `./input-jpg/` as `page-001.jpg`, `page-002.jpg`, …

Options:

| Flag | Default | Description |
|---|---|---|
| `-o, --out <dir>` | `./<name>-jpg` | output directory |
| `-d, --dpi <n>` | `150` | render DPI (higher = sharper, larger files) |
| `-q, --quality <n>` | `85` | JPEG quality, 1–100 |
| `-p, --pages <range>` | all pages | e.g. `1-3,5,7-` |

Examples:

```bash
pdfwoy jpg report.pdf -o ./out -d 300 -q 95
pdfwoy jpg report.pdf -p 1-3,7    # pages 1, 2, 3, and 7
pdfwoy jpg report.pdf -p 5-       # page 5 to the end
```

### Compress a PDF

```bash
pdfwoy compress input.pdf
```

Writes the result to `./input.compressed.pdf` by default.

Options:

| Flag | Default | Description |
|---|---|---|
| `-o, --out <file>` | `<name>.compressed.pdf` | output path |
| `-l, --level <preset>` | `ebook` | `screen` \| `ebook` \| `printer` \| `prepress` |

Presets, smallest to largest:

- **screen** — 72 dpi, aggressive. Good for sharing online.
- **ebook** — 150 dpi, balanced. Good default for most documents.
- **printer** — 300 dpi. Suitable for printing.
- **prepress** — 300 dpi, color-preserving. Suitable for professional print.

Example:

```bash
pdfwoy compress contract.pdf -l screen -o contract.small.pdf
```

### Doctor

```bash
pdfwoy doctor
```

Checks Node version, platform support, and whether Ghostscript is reachable.

### Install dependencies

```bash
pdfwoy install-deps
```

Installs Ghostscript using your platform's package manager. Use `--yes` to skip the confirmation prompt in CI.

## How it works (briefly)

- **jpg** — uses [`pdf-to-img`](https://www.npmjs.com/package/pdf-to-img) to rasterize pages and [`sharp`](https://sharp.pixelplumbing.com/) to encode JPEGs.
- **compress** — shells out to Ghostscript with one of its standard `PDFSETTINGS` presets.

Everything runs in your terminal. No network calls, no upload, no telemetry.
