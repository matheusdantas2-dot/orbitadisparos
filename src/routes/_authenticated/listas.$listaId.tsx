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
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
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

      <Dialog open={openImport} onOpenChange={setOpenImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar contatos via CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
              <p className="font-medium text-foreground">Como funciona</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Baixe o modelo CSV abaixo.</li>
                <li>Preencha os contatos seguindo o exemplo (não altere o cabeçalho).</li>
                <li>Salve em formato <code className="text-foreground">.csv</code> (UTF-8).</li>
                <li>Clique em <span className="text-foreground font-medium">Selecionar arquivo</span> e envie.</li>
              </ol>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="font-medium text-foreground">Formato esperado</p>
              <pre className="text-xs bg-muted/60 rounded p-2 overflow-x-auto">
nome,telefone,var1,var2,var3
João Silva,5511999999999,Cliente VIP,SP,
Maria Souza,5511988887777,Lead,RJ,Promo10</pre>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Apenas <code className="text-foreground">telefone</code> é obrigatório.</li>
                <li>Telefone com DDI + DDD, sem espaços (ex.: <code>5511999999999</code>).</li>
                <li><code>var1</code>, <code>var2</code>, <code>var3</code> podem ser usadas como variáveis na mensagem.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={baixarModeloCSV}>
                <Download className="mr-2 h-4 w-4" /> Baixar modelo CSV
              </Button>
              <Button className="flex-1" onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Selecionar arquivo
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenImport(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
