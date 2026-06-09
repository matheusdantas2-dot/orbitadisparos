import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, X, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/listas/$listaId")({
  component: ListaDetalhe,
});

function ListaDetalhe() {
  const { listaId } = Route.useParams();
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: lista } = useQuery({
    queryKey: ["lista", listaId],
    queryFn: async () => {
      const { data } = await supabase.from("listas").select("*").eq("id", listaId).maybeSingle();
      return data;
    },
  });

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["contatos", listaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("*")
        .eq("lista_id", listaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["contatos", listaId] });

  const [openAdd, setOpenAdd] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [form, setForm] = useState({ nome: "", telefone: "", var1: "", var2: "", var3: "" });

  type ParsedRow = {
    line: number;
    nome: string | null;
    telefone: string;
    var1: string | null;
    var2: string | null;
    var3: string | null;
  };
  type RowError = { line: number; reason: string };
  type Preview = {
    fileName: string;
    totalLines: number;
    valid: ParsedRow[];
    errors: RowError[];
    headerWarning?: string;
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);

  const resetImport = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const baixarModeloCSV = () => {
    const csv =
      "nome,telefone,var1,var2,var3\n" +
      "João Silva,5511999999999,Cliente VIP,SP,\n" +
      "Maria Souza,5511988887777,Lead,RJ,Promo10\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-contatos-orbita.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAdd = async () => {
    if (!form.telefone.trim()) return toast.error("Telefone é obrigatório");
    const { error } = await supabase.from("contatos").insert({
      user_id: uid,
      lista_id: listaId,
      nome: form.nome || null,
      telefone: form.telefone,
      var1: form.var1 || null,
      var2: form.var2 || null,
      var3: form.var3 || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Contato adicionado");
    setForm({ nome: "", telefone: "", var1: "", var2: "", var3: "" });
    setOpenAdd(false);
    refresh();
  };

  const parseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.csv$/i.test(file.name)) {
      toast.error("Arquivo precisa ter extensão .csv");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5MB)");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const text = await file.text();
    const allLines = text.split(/\r?\n/);
    const lines = allLines.map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast.error("CSV está vazio");
      return;
    }

    // detectar separador (vírgula ou ponto-e-vírgula)
    const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    const idxNome = headers.indexOf("nome");
    const idxTel = headers.findIndex((h) => h === "telefone" || h === "phone" || h === "celular");
    const idxV1 = headers.indexOf("var1");
    const idxV2 = headers.indexOf("var2");
    const idxV3 = headers.indexOf("var3");

    if (idxTel === -1) {
      setPreview({
        fileName: file.name,
        totalLines: lines.length - 1,
        valid: [],
        errors: [{ line: 1, reason: 'Coluna obrigatória "telefone" não encontrada no cabeçalho.' }],
      });
      return;
    }

    const knownCols = new Set(["nome", "telefone", "phone", "celular", "var1", "var2", "var3"]);
    const unknown = headers.filter((h) => h && !knownCols.has(h));
    const headerWarning = unknown.length > 0 ? `Colunas ignoradas: ${unknown.join(", ")}` : undefined;

    const valid: ParsedRow[] = [];
    const errors: RowError[] = [];
    const seen = new Set<string>();

    lines.slice(1).forEach((l, i) => {
      const lineNum = i + 2; // 1-based + header
      const cols = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const raw = cols[idxTel] ?? "";
      const tel = raw.replace(/\D/g, "");

      if (!tel) {
        errors.push({ line: lineNum, reason: "Telefone vazio" });
        return;
      }
      if (tel.length < 10 || tel.length > 15) {
        errors.push({ line: lineNum, reason: `Telefone inválido (${raw}) — esperado 10 a 15 dígitos com DDI/DDD` });
        return;
      }
      if (seen.has(tel)) {
        errors.push({ line: lineNum, reason: `Telefone duplicado no arquivo (${tel})` });
        return;
      }
      seen.add(tel);

      valid.push({
        line: lineNum,
        nome: idxNome >= 0 ? cols[idxNome] || null : null,
        telefone: tel,
        var1: idxV1 >= 0 ? cols[idxV1] || null : null,
        var2: idxV2 >= 0 ? cols[idxV2] || null : null,
        var3: idxV3 >= 0 ? cols[idxV3] || null : null,
      });
    });

    setPreview({ fileName: file.name, totalLines: lines.length - 1, valid, errors, headerWarning });
  };

  const confirmImport = async () => {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    try {
      const payload = preview.valid.map((r) => ({
        user_id: uid,
        lista_id: listaId,
        nome: r.nome,
        telefone: r.telefone,
        var1: r.var1,
        var2: r.var2,
        var3: r.var3,
      }));
      const { error } = await supabase.from("contatos").insert(payload);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${payload.length} contatos importados com sucesso`);
      resetImport();
      setOpenImport(false);
      refresh();
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contatos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild size="icon" variant="ghost">
          <Link to="/listas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{lista?.nome ?? "Lista"}</h1>
          <p className="text-sm text-muted-foreground">{contatos?.length ?? 0} contatos</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={parseFile} />
        <Button variant="outline" onClick={() => setOpenImport(true)}>
          <Upload className="mr-2 h-4 w-4" /> Importar CSV
        </Button>
        <Button onClick={() => setOpenAdd(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar contato
        </Button>
      </div>


      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>var1</TableHead>
                  <TableHead>var2</TableHead>
                  <TableHead>var3</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contatos?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome ?? "—"}</TableCell>
                    <TableCell>{c.telefone}</TableCell>
                    <TableCell>{c.var1 ?? ""}</TableCell>
                    <TableCell>{c.var2 ?? ""}</TableCell>
                    <TableCell>{c.var3 ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {contatos?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhum contato. Importe um CSV ou adicione manualmente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar contato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="5511999999999" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="var1">var1</Label>
                <Input id="var1" value={form.var1} onChange={(e) => setForm({ ...form, var1: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var2">var2</Label>
                <Input id="var2" value={form.var2} onChange={(e) => setForm({ ...form, var2: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="var3">var3</Label>
                <Input id="var3" value={form.var3} onChange={(e) => setForm({ ...form, var3: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openImport}
        onOpenChange={(o) => {
          setOpenImport(o);
          if (!o) resetImport();
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent">
            <DialogTitle className="flex items-center gap-2.5 font-display text-xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg brand-gradient text-primary-foreground">
                <Upload className="h-4 w-4" />
              </span>
              Importar contatos via CSV
            </DialogTitle>
          </DialogHeader>

          {!preview ? (
            <div className="px-6 py-5 space-y-4 text-sm">
              <ol className="grid gap-3 sm:grid-cols-2">
                {[
                  { n: 1, t: "Baixe o modelo", d: "Use o arquivo de exemplo abaixo." },
                  { n: 2, t: "Preencha os contatos", d: "Mantenha o cabeçalho intacto." },
                  { n: 3, t: "Salve como .csv", d: "Codificação UTF-8." },
                  { n: 4, t: "Envie o arquivo", d: "Validamos antes de importar." },
                ].map((s) => (
                  <li key={s.n} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full brand-gradient text-xs font-bold text-primary-foreground">
                      {s.n}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{s.t}</p>
                      <p className="text-xs text-muted-foreground">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Formato esperado
                  </span>
                  <Badge variant="secondary" className="text-[10px]">CSV · UTF-8</Badge>
                </div>
                <pre className="text-[11px] leading-relaxed px-3 py-2.5 bg-card overflow-x-auto whitespace-pre">
{`nome,telefone,var1,var2,var3
João Silva,5511999999999,Cliente VIP,SP,
Maria Souza,5511988887777,Lead,RJ,Promo10`}
                </pre>
                <ul className="text-[11px] text-muted-foreground px-3 py-2 space-y-0.5 border-t border-border">
                  <li>• <code className="text-foreground">telefone</code> é obrigatório (10–15 dígitos com DDI/DDD).</li>
                  <li>• <code className="text-foreground">nome</code>, <code className="text-foreground">var1</code>, <code className="text-foreground">var2</code>, <code className="text-foreground">var3</code> são opcionais.</li>
                  <li>• Separador aceito: vírgula (,) ou ponto-e-vírgula (;).</li>
                  <li>• Tamanho máximo: 5MB.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={baixarModeloCSV}>
                  <Download className="mr-2 h-4 w-4" /> Baixar modelo
                </Button>
                <Button className="flex-1" onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Selecionar arquivo
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{preview.fileName}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={resetImport}>
                  <X className="h-3.5 w-3.5 mr-1" /> Trocar
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Linhas" value={preview.totalLines} tone="muted" />
                <StatCard label="Válidos" value={preview.valid.length} tone="success" />
                <StatCard label="Com erro" value={preview.errors.length} tone="destructive" />
              </div>

              {preview.headerWarning && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Atenção</AlertTitle>
                  <AlertDescription>{preview.headerWarning}</AlertDescription>
                </Alert>
              )}

              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-destructive/30">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-semibold text-destructive">
                      {preview.errors.length} {preview.errors.length === 1 ? "erro encontrado" : "erros encontrados"}
                    </span>
                  </div>
                  <ScrollArea className="max-h-40">
                    <ul className="divide-y divide-destructive/20 text-xs">
                      {preview.errors.slice(0, 50).map((e, i) => (
                        <li key={i} className="flex gap-2 px-3 py-1.5">
                          <Badge variant="destructive" className="shrink-0 text-[10px] font-mono">L{e.line}</Badge>
                          <span className="text-foreground">{e.reason}</span>
                        </li>
                      ))}
                      {preview.errors.length > 50 && (
                        <li className="px-3 py-1.5 text-muted-foreground italic">
                          + {preview.errors.length - 50} erros adicionais não exibidos
                        </li>
                      )}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {preview.valid.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-xs font-semibold">Pré-visualização (primeiros 5)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">Nome</th>
                          <th className="text-left px-3 py-1.5 font-medium">Telefone</th>
                          <th className="text-left px-3 py-1.5 font-medium">var1</th>
                          <th className="text-left px-3 py-1.5 font-medium">var2</th>
                          <th className="text-left px-3 py-1.5 font-medium">var3</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.valid.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5">{r.nome ?? "—"}</td>
                            <td className="px-3 py-1.5 font-mono">{r.telefone}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.var1 ?? ""}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.var2 ?? ""}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.var3 ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
            {preview ? (
              <>
                <Button variant="outline" onClick={resetImport} disabled={importing}>
                  Voltar
                </Button>
                <Button
                  onClick={confirmImport}
                  disabled={preview.valid.length === 0 || importing}
                  className="elegant-shadow"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {importing ? "Importando..." : `Importar ${preview.valid.length} contato(s)`}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setOpenImport(false)}>Fechar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
