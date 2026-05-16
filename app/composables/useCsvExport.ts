/**
 * app/composables/useCsvExport.ts — browser-side CSV download helper
 * (W3-2 / EH-K / ADR-0030).
 *
 * # What this file owns
 *   - `useCsvExport().download({ rows, columns, filename })` serializes
 *     the rows through the pure `rowsToCsv` helper (`shared/utils/reporting`)
 *     and triggers a browser download via `Blob` + `URL.createObjectURL`.
 *
 * # Decisions (ADR-0008, ADR-0030)
 *   - **No new dependency**: hand-rolled CSV builder + a 5-line anchor
 *     download dance. Adding `papaparse` for this is gratuitous.
 *   - **SSR-safe**: the export only runs from a user gesture (click), so
 *     it's safe to assume `window` + `document` exist at call time.
 *     We still guard so the build doesn't choke on SSR pre-render.
 *   - **Filename**: callers pass a base name; we append `.csv` if the
 *     caller forgot. Anchor element is created, clicked, and removed
 *     synchronously \u2014 no leaked DOM nodes.
 */
import { rowsToCsv, type CsvColumn } from '~~/shared/utils/reporting'

export interface CsvExportRequest<T> {
  rows: T[]
  columns: CsvColumn<T>[]
  filename: string
}

export function useCsvExport() {
  function buildCsv<T>(req: CsvExportRequest<T>): string {
    return rowsToCsv(req.rows, req.columns)
  }

  function download<T>(req: CsvExportRequest<T>): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const csv = buildCsv(req)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = req.filename.endsWith('.csv') ? req.filename : `${req.filename}.csv`
    anchor.setAttribute('data-testid', 'csv-download-anchor')
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    // Free the blob on the next tick so the click has fully processed.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return { buildCsv, download }
}
