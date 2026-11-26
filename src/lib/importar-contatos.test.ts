import { describe, expect, it } from "vitest";
import { parseCSV, parseXLSX } from "./importar-contatos";

const headers = ["CNPJ", "Razão Social", "Telefones", "E-mail"];
const empresa = (phone: unknown) => ["70233612000100", "TAMIRES DIAS DE CARVALHO", phone, "psico.tamiresdias@gmail.com"];

describe("importação XLSX", () => {
  it("mapeia a empresa e acrescenta DDI 55 ao celular informado", () => {
    expect(parseXLSX([headers, empresa("11-971006165")]).valid).toEqual([{
      line: 2, nome: "TAMIRES DIAS DE CARVALHO", telefone: "5511971006165",
      var1: "70233612000100", var2: "psico.tamiresdias@gmail.com", var3: null,
    }]);
  });
  it("deduplica dois celulares iguais", () => {
    const preview = parseXLSX([headers, empresa("11-977654575,11-977654575")]);
    expect(preview.valid.map((c) => c.telefone)).toEqual(["5511977654575"]);
    expect(preview.errors).toEqual([{ line: 2, reason: "Telefone duplicado no arquivo (5511977654575)" }]);
  });
  it("mantém o fixo e o celular na mesma linha", () => {
    const preview = parseXLSX([headers, empresa("16-36309988,16-981211521")]);
    expect(preview.valid.map((c) => c.telefone)).toEqual(["551636309988", "5516981211521"]);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings.map((w) => w.telefone)).toEqual(["551636309988"]);
  });
  it("mantém 11-25987239 como contato com aviso separado", () => {
    const preview = parseXLSX([headers, empresa("11-25987239")]);
    expect(preview.valid.map((c) => c.telefone)).toEqual(["551125987239"]);
    expect(preview.warnings).toEqual([{ line: 2, telefone: "551125987239", reason: "Número parece fixo e não recebe WhatsApp" }]);
    expect(preview.errors).toEqual([]);
  });
  it("registra erro para telefone vazio", () => {
    const preview = parseXLSX([headers, empresa("")]);
    expect(preview.valid).toEqual([]);
    expect(preview.errors).toEqual([{ line: 2, reason: "Telefone vazio" }]);
  });
  it("aceita vírgula, ponto e vírgula e barra", () => {
    expect(parseXLSX([headers, empresa("11-971006165;16-981211521/11-977654575,11-25987239")]).valid.map((c) => c.telefone))
      .toEqual(["5511971006165", "5516981211521", "5511977654575", "551125987239"]);
  });
  it("preserva o DDI existente e deduplica entre linhas", () => {
    const preview = parseXLSX([headers, empresa("+55 (11) 97100-6165"), empresa("11-971006165")]);
    expect(preview.valid.map((c) => c.telefone)).toEqual(["5511971006165"]);
    expect(preview.errors).toEqual([{ line: 3, reason: "Telefone duplicado no arquivo (5511971006165)" }]);
  });
  it("rejeita números fora de 12–13 dígitos após normalização", () => {
    const preview = parseXLSX([headers, empresa("123456789;12345678901234")]);
    expect(preview.valid).toEqual([]);
    expect(preview.errors).toEqual([
      { line: 2, reason: "Telefone inválido" }, { line: 2, reason: "Telefone inválido" },
      { line: 2, reason: "Telefone vazio" },
    ]);
  });
  it("compara cabeçalhos sem acentos e sem distinguir maiúsculas", () => {
    const preview = parseXLSX([[" E-MAIL ", "TELEFONES", "RAZÃO SOCIAL", "cnpj"], ["a@b.com", "11-971006165", "Empresa", "123"]]);
    expect(preview.valid).toEqual([{ line: 2, nome: "Empresa", telefone: "5511971006165", var1: "123", var2: "a@b.com", var3: null }]);
  });
  it("preserva números de linha ao ignorar linhas completamente vazias", () => {
    const preview = parseXLSX([headers, [], empresa("11-971006165")]);
    expect(preview.totalLines).toBe(1);
    expect(preview.valid[0]?.line).toBe(3);
  });
  it("exige a coluna Telefones", () => {
    expect(parseXLSX([["nome"], ["Empresa"]]).errors).toEqual([{ line: 1, reason: 'Coluna obrigatória "Telefones" não encontrada no cabeçalho.' }]);
  });
  it("processa 2000 empresas", () => {
    const rows = Array.from({ length: 2000 }, (_, i) => empresa(String(11971000000 + i)));
    const preview = parseXLSX([headers, ...rows]);
    expect(preview.totalLines).toBe(2000);
    expect(preview.valid).toHaveLength(2000);
    expect(preview.errors).toEqual([]);
  });
});

describe("CSV sem regressão", () => {
  it("preserva exatamente os contatos do modelo CSV", () => {
    const preview = parseCSV("nome,telefone,var1,var2,var3\nJoão Silva,5511999999999,Cliente VIP,SP,\nMaria Souza,5511988887777,Lead,RJ,Promo10\n", "modelo.csv");
    expect(preview).toEqual({
      fileName: "modelo.csv", totalLines: 2, errors: [], warnings: [], valid: [
        { line: 2, nome: "João Silva", telefone: "5511999999999", var1: "Cliente VIP", var2: "SP", var3: null },
        { line: 3, nome: "Maria Souza", telefone: "5511988887777", var1: "Lead", var2: "RJ", var3: "Promo10" },
      ],
    });
  });
  it("não aplica DDI, divisão de telefones ou avisos de fixo ao CSV", () => {
    const preview = parseCSV("telefone;nome\n11-25987239;Fixo\n11-971006165;Celular\n123456789012345;Internacional\n11-971006165/12;Texto");
    expect(preview.valid.map((c) => c.telefone)).toEqual(["1125987239", "11971006165", "123456789012345", "1197100616512"]);
    expect(preview.warnings).toEqual([]);
    expect(preview.errors).toEqual([]);
  });
  it("mantém erros de vazio, comprimento e duplicidade do CSV", () => {
    const preview = parseCSV("nome,telefone\nA,\nB,123\nC,5511999999999\nD,+55 (11) 99999-9999");
    expect(preview.errors).toEqual([
      { line: 2, reason: "Telefone vazio" },
      { line: 3, reason: "Telefone inválido (123) — esperado 10 a 15 dígitos com DDI/DDD" },
      { line: 5, reason: "Telefone duplicado no arquivo (5511999999999)" },
    ]);
  });
  it("preserva aliases, aspas simples de campo e colunas ignoradas", () => {
    const preview = parseCSV('nome;celular;extra\n"Ana";"11-971006165";ignorar');
    expect(preview.valid).toEqual([{ line: 2, nome: "Ana", telefone: "11971006165", var1: null, var2: null, var3: null }]);
    expect(preview.headerWarning).toBe("Colunas ignoradas: extra");
    expect(parseCSV("phone\n5511999999999").valid[0]?.telefone).toBe("5511999999999");
  });
  it("preserva o erro de cabeçalho ausente e de arquivo vazio", () => {
    expect(parseCSV("nome\nAna").errors).toEqual([{ line: 1, reason: 'Coluna obrigatória "telefone" não encontrada no cabeçalho.' }]);
    expect(() => parseCSV("\n  \n")).toThrow("CSV está vazio");
  });
});