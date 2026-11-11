import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/listas/")({
  component: ListasPage,
});

function ListasPage() {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();

  const { data: listas, isLoading } = useQuery({
    queryKey: ["listas", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listas")
        .select("*, contatos(count)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [busca, setBusca] = useState("");
  const termo = busca.trim();
  const { data: resultados, isFetching: buscando } = useQuery({
    queryKey: ["busca-contatos", uid, termo],
    enabled: termo.length >= 2,
    queryFn: async () => {
      const safe = termo.replace(/[%,()]/g, "");
      const digits = safe.replace(/\D/g, "");
      const filtros = [`nome.ilike.%${safe}%`];
      if (digits) filtros.push(`telefone.ilike.%${digits}%`);
      const { data, error } = await supabase
        .from("contatos")
        .select("id, nome, telefone, lista_id, listas(nome)")
        .eq("user_id", uid)
        .or(filtros.join(","))
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const [openNew, setOpenNew] = useState(false);
  const [nome, setNome] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["listas", uid] });

  const handleCreate = async () => {
    if (!nome.trim()) return toast.error("Informe um nome");
    const { error } = await supabase.from("listas").insert({ user_id: uid, nome });
    if (error) return toast.error(error.message);
    toast.success("Lista criada");
    setNome("");
    setOpenNew(false);
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("listas").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Lista excluída");
    setDeleteId(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listas de Contatos</h1>
          <p className="text-sm text-muted-foreground">Organize seus contatos em listas</p>
        </div>
        <Button onClick={() => setOpenNew(true)}><Plus className="mr-2 h-4 w-4" />Nova lista</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar nome ou número em todas as listas..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {termo.length >= 2 && (
            buscando && !resultados ? (
              <Skeleton className="h-16" />
            ) : resultados && resultados.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Lista</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.nome || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{c.telefone}</TableCell>
                      <TableCell>{c.listas?.nome ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/listas/$listaId" params={{ listaId: c.lista_id }}>Abrir lista</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
            )
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : listas && listas.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contatos</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listas.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.nome}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {l.contatos?.[0]?.count ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(l.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/listas/$listaId" params={{ listaId: l.id }}>Abrir</Link>
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(l.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma lista criada.
          </CardContent>
        </Card>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova lista</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nm">Nome da lista</Label>
            <Input id="nm" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
            <AlertDialogDescription>Todos os contatos da lista serão excluídos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
