# Architecture rules
- Keep CSV and XLSX contact parsing in separate pure functions in `src/lib/importar-contatos.ts`; format-specific phone rules must not leak into CSV.
- Load SheetJS dynamically in the file-selection handler; workbook decoding is browser-only and should not enlarge the initial route bundle.