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
import { ArrowLeft, Trash2, Upload } from "lucide-react";
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return toast.error("CSV vazio");
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idxNome = headers.indexOf("nome");
    const idxTel = headers.findIndex((h) => h === "telefone" || h === "phone");
    if (idxTel === -1) return toast.error('CSV precisa ter coluna "telefone"');
    const idxV1 = headers.indexOf("var1");
    const idxV2 = headers.indexOf("var2");
    const idxV3 = headers.indexOf("var3");

    const rows = lines.slice(1).map((l) => {
      const cols = l.split(",").map((c) => c.trim());
      return {
        user_id: uid,
        lista_id: listaId,
        nome: idxNome >= 0 ? cols[idxNome] : null,
        telefone: cols[idxTel],
        var1: idxV1 >= 0 ? cols[idxV1] : null,
        var2: idxV2 >= 0 ? cols[idxV2] : null,
        var3: idxV3 >= 0 ? cols[idxV3] : null,
      };
    }).filter((r) => r.telefone);

    if (rows.length === 0) return toast.error("Nenhum contato válido");
    const { error } = await supabase.from("contatos").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} contatos importados`);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contatos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost">
          <Link to="/listas"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{lista?.nome ?? "Lista"}</h1>
          <p className="text-sm text-muted-foreground">{contatos?.length ?? 0} contatos</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Importar CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Formato CSV: <code>nome,telefone,var1,var2,var3</code> (apenas <code>telefone</code> é obrigatório).
      </p>

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
                      Nenhum contato. Importe um CSV.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
