export type ParsedRow = {
  line: number;
  nome: string | null;
  telefone: string;
  var1: string | null;
  var2: string | null;
  var3: string | null;
};
export type RowError = { line: number; reason: string };
export type ImportWarning = { line: number; telefone: string; reason: string };
export type Preview = {
  fileName: string;
  totalLines: number;
  valid: ParsedRow[];
  errors: RowError[];
  warnings: ImportWarning[];
  headerWarning?: string;
};

// Preserve the original CSV parser, including separator and quote handling.
export function parseCSV(text: string, fileName = "contatos.csv"): Preview {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const firstLine = lines[0];
  if (firstLine === undefined) throw new Error("CSV está vazio");
  const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const headers = firstLine.split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const idxNome = headers.indexOf("nome");
  const idxTel = headers.findIndex((h) => h === "telefone" || h === "phone" || h === "celular");
  const idxV1 = headers.indexOf("var1");
  const idxV2 = headers.indexOf("var2");
  const idxV3 = headers.indexOf("var3");
  const preview: Preview = { fileName, totalLines: lines.length - 1, valid: [], errors: [], warnings: [] };
  if (idxTel === -1) {
    preview.errors.push({ line: 1, reason: 'Coluna obrigatória "telefone" não encontrada no cabeçalho.' });
    return preview;
  }
  const knownCols = new Set(["nome", "telefone", "phone", "celular", "var1", "var2", "var3"]);
  const unknown = headers.filter((h) => h && !knownCols.has(h));
  if (unknown.length > 0) preview.headerWarning = `Colunas ignoradas: ${unknown.join(", ")}`;
  const seen = new Set<string>();
  lines.slice(1).forEach((l, i) => {
    const lineNum = i + 2;
    const cols = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const raw = cols[idxTel] ?? "";
    const tel = raw.replace(/\D/g, "");
    if (!tel) {
      preview.errors.push({ line: lineNum, reason: "Telefone vazio" });
      return;
    }
    if (tel.length < 10 || tel.length > 15) {
      preview.errors.push({ line: lineNum, reason: `Telefone inválido (${raw}) — esperado 10 a 15 dígitos com DDI/DDD` });
      return;
    }
    if (seen.has(tel)) {
      preview.errors.push({ line: lineNum, reason: `Telefone duplicado no arquivo (${tel})` });
      return;
    }
    seen.add(tel);
    preview.valid.push({
      line: lineNum,
      nome: idxNome >= 0 ? cols[idxNome] || null : null,
      telefone: tel,
      var1: idxV1 >= 0 ? cols[idxV1] || null : null,
      var2: idxV2 >= 0 ? cols[idxV2] || null : null,
      var3: idxV3 >= 0 ? cols[idxV3] || null : null,
    });
  });
  return preview;
}

function cellText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Receives the first worksheet as rows, including the header at index zero.
export function parseXLSX(rows: readonly (readonly unknown[])[], fileName = "contatos.xlsx"): Preview {
  const header = rows[0];
  if (!header || rows.every((row) => row.every((cell) => !cellText(cell)))) {
    throw new Error("XLSX está vazio");
  }
  const headers = header.map(normalizeHeader);
  const idxNome = headers.indexOf("razao social");
  const idxTel = headers.indexOf("telefones");
  const idxCnpj = headers.indexOf("cnpj");
  const idxEmail = headers.indexOf("e-mail");
  const preview: Preview = { fileName, totalLines: 0, valid: [], errors: [], warnings: [] };
  const dataRows = rows.slice(1).map((row, i) => ({ row, line: i + 2 }))
    .filter(({ row }) => row.some((cell) => cellText(cell)));
  preview.totalLines = dataRows.length;
  if (idxTel < 0) {
    preview.errors.push({ line: 1, reason: 'Coluna obrigatória "Telefones" não encontrada no cabeçalho.' });
    return preview;
  }
  const known = new Set(["razao social", "telefones", "cnpj", "e-mail"]);
  const unknown = headers.filter((h) => h && !known.has(h));
  if (unknown.length > 0) preview.headerWarning = `Colunas ignoradas: ${unknown.join(", ")}`;
  const seen = new Set<string>();
  for (const { row, line } of dataRows) {
    let hasValidPhone = false;
    for (const part of cellText(row[idxTel]).split(/[,;/]/)) {
      const digits = part.replace(/\D/g, "");
      if (!digits) {
        if (part.trim()) preview.errors.push({ line, reason: "Telefone inválido" });
        continue;
      }
      const telefone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
      if (telefone.length < 12 || telefone.length > 13) {
        preview.errors.push({ line, reason: "Telefone inválido" });
        continue;
      }
      hasValidPhone = true;
      if (seen.has(telefone)) {
        preview.errors.push({ line, reason: `Telefone duplicado no arquivo (${telefone})` });
        continue;
      }
      seen.add(telefone);
      preview.valid.push({
        line,
        nome: cellText(row[idxNome]) || null,
        telefone,
        var1: cellText(row[idxCnpj]) || null,
        var2: cellText(row[idxEmail]) || null,
        var3: null,
      });
      if (telefone.length === 12) {
        preview.warnings.push({ line, telefone, reason: "Número parece fixo e não recebe WhatsApp" });
      }
    }
    if (!hasValidPhone) preview.errors.push({ line, reason: "Telefone vazio" });
  }
  return preview;
}