
# PDF Merge Feature Approaches

I have explored the project and understand the requirements. Here are two approaches for implementing the `merge` command:

## Approach 1: Extend Ghostscript Wrapper (Recommended)
This approach leverages the existing infrastructure in the project. Since `pdfwoy` already uses Ghostscript for compression, we can extend the `ghostscript.ts` utility to handle merging.

- **Pros:** 
  - No new dependencies.
  - Consistent with the existing architecture.
  - Ghostscript is highly reliable for PDF operations.
- **Cons:** 
  - Requires Ghostscript to be installed (handled by `doctor` and `install-deps` commands).

## Approach 2: Use `pdf-lib` (Alternative)
We could add a pure JavaScript dependency like `pdf-lib` to handle the merge.

- **Pros:**
  - No external tool dependency (Ghostscript) required for this specific feature.
  - Potentially faster for simple merges.
- **Cons:**
  - Increases bundle size/dependency count.
  - Inconsistent with the current pattern of using external power-tools for PDF heavy-lifting.

---

### Recommendation
I recommend **Approach 1** because it aligns with how the project currently handles PDF processing and keeps the dependency list lean.

**Proposed CLI Usage:**
```bash
pdfwoy merge file1.pdf file2.pdf file3.pdf -o output.pdf
```

Does this recommendation work for you?
