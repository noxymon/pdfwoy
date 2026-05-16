# Design: PDF Merge Feature

## Overview
Add a new command `merge` to the `pdfwoy` CLI that allows users to combine multiple PDF files into a single document. The order of merging will match the order of files provided in the command line.

## User Interface
The command will follow the project's convention using `commander`.

```bash
pdfwoy merge <files...> -o <output>
```

### Arguments & Flags
- `files...`: A variadic argument representing one or more input PDF files.
- `-o, --output <path>`: (Required) The path where the merged PDF will be saved.

### Validation
1. **Input Count**: Must provide at least two files to merge.
2. **File Existence**: Each input path must exist.
3. **File Type**: Each input file should have a `.pdf` extension (case-insensitive).
4. **Output Path**: Must be specified and the parent directory must exist.

## Architecture

### 1. Utility Layer (`src/utils/ghostscript.ts`)
The `runGhostscript` function will be refactored to support merging.

**Changes:**
- Update `CompressOptions` to `GhostscriptOptions`.
- Change `input` field from `string` to `string | string[]`.
- Ensure the argument list passed to `spawn` correctly appends all input files at the end.

### 2. Command Layer (`src/commands/merge.ts`)
A new file `src/commands/merge.ts` will implement the command logic.

**Responsibilities:**
- Define the `merge` command using `commander`.
- Use `ora` for a progress spinner.
- Perform file and path validation.
- Resolve the Ghostscript path using existing `getGsPath` utility.
- Call `runGhostscript` and handle success/failure logging with `chalk`.

### 3. CLI Entry Point (`src/cli.ts`)
- Import `mergeCommand`.
- Register it with `program.addCommand(mergeCommand())`.

## Implementation Details

### Ghostscript Command
The underlying command executed will be:
```bash
gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dQUIET -sOutputFile=<output> <input1> <input2> ... <inputN>
```

### Dependencies
- **Ghostscript**: Required for execution. The command will rely on the existing `startupDepCheck` and `doctor` command to ensure it is available.

## Success Criteria
- Running `pdfwoy merge a.pdf b.pdf -o merged.pdf` produces a valid PDF containing pages from `a.pdf` followed by `b.pdf`.
- Informative error messages are shown for missing files, insufficient arguments, or Ghostscript failures.
- The UI remains consistent with existing commands (using spinners and color-coded logs).

## Testing Strategy
- **Unit Tests**: Add tests for `runGhostscript` refactoring if applicable.
- **Integration Tests**: Add a new test case in `test/integration.test.ts` (or a new file) that:
  1. Generates two simple PDF files.
  2. Runs the `merge` command.
  3. Verifies the output file exists and (optionally) checks page count/validity if possible with available tools.
