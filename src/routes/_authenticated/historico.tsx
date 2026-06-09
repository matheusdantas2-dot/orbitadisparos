import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pause, Play, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { webhooks } from "@/lib/webhooks";

export const Route = createFileRoute("/_authenticated/historico")({
  component: Historico,
});

function Historico() {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();

  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [dataFiltro, setDataFiltro] = useState<string>("");
  const [conexaoFiltro, setConexaoFiltro] = useState<string>("todas");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);

  const { data: conexoes } = useQuery({
    queryKey: ["conx-min", uid],
    queryFn: async () => (await supabase.from("conexoes").select("id, nome").eq("user_id", uid)).data ?? [],
  });

  const { data: disparos, isLoading } = useQuery({
    queryKey: ["disparos", uid, statusFiltro, dataFiltro, conexaoFiltro],
    queryFn: async () => {
      let q = supabase.from("disparos").select("*, conexoes(nome)").eq("user_id", uid).order("created_at", { ascending: false });
      if (statusFiltro !== "todos") q = q.eq("status", statusFiltro);
      if (conexaoFiltro !== "todas") q = q.eq("conexao_id", conexaoFiltro);
      if (dataFiltro) {
        const d = new Date(dataFiltro);
        const next = new Date(d);
        next.setDate(d.getDate() + 1);
        q = q.gte("created_at", d.toISOString()).lt("created_at", next.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`disparos-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "disparos", filter: `user_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ["disparos", uid] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["disparos", uid] });

  const handlePausar = async (id: string) => {
    try {
      await webhooks.pausarDisparo({ user_id: uid, disparo_id: id });
      await supabase.from("disparos").update({ status: "pausado" }).eq("id", id);
      toast.success("Disparo pausado");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const handleRetomar = async (id: string) => {
    try {
      await webhooks.retomarDisparo({ user_id: uid, disparo_id: id });
      await supabase.from("disparos").update({ status: "em_andamento" }).eq("id", id);
      toast.success("Disparo retomado");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const handleExcluir = async () => {
    if (!excluirId) return;
    try {
      await webhooks.excluirDisparo({ user_id: uid, disparo_id: excluirId });
      await supabase.from("disparos").delete().eq("id", excluirId);
      toast.success("Disparo excluído");
      setExcluirId(null);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Histórico de Disparos</h1>
        <p className="text-sm text-muted-foreground">Acompanhe e gerencie suas campanhas</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="pausado">Pausado</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="falho">Falho</SelectItem>
            </SelectContent>
          </Select>
          <Select value={conexaoFiltro} onValueChange={setConexaoFiltro}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas conexões</SelectItem>
              {conexoes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} className="w-44" />
        </CardContent>
      </Card>

      {isLoading ? <Skeleton className="h-40" /> : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Conexão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Enviados</TableHead>
                  <TableHead>Falhos</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disparos?.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell>{d.tipo}</TableCell>
                    <TableCell>{d.conexoes?.nome ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>{d.total}</TableCell>
                    <TableCell className="text-success">{d.enviados}</TableCell>
                    <TableCell className="text-destructive">{d.falhos}</TableCell>
                    <TableCell>{new Date(d.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => setDetalheId(d.id)}><Eye className="h-4 w-4" /></Button>
                      {d.status !== "pausado" ? (
                        <Button size="icon" variant="ghost" onClick={() => handlePausar(d.id)}><Pause className="h-4 w-4" /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" onClick={() => handleRetomar(d.id)}><Play className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setExcluirId(d.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {disparos?.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sem disparos</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <DetalheDrawer disparoId={detalheId} onClose={() => setDetalheId(null)} userId={uid} />

      <AlertDialog open={!!excluirId} onOpenChange={(v) => !v && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir disparo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pendente: { cls: "bg-warning text-warning-foreground", label: "Pendente" },
    em_andamento: { cls: "bg-primary text-primary-foreground", label: "Em andamento" },
    pausado: { cls: "bg-muted text-muted-foreground", label: "Pausado" },
    concluido: { cls: "bg-success text-success-foreground", label: "Concluído" },
    falho: { cls: "bg-destructive text-destructive-foreground", label: "Falho" },
    enviado: { cls: "bg-success text-success-foreground", label: "Enviado" },
  };
  const cfg = map[status] || { cls: "bg-muted text-muted-foreground", label: status };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function DetalheDrawer({
  disparoId, onClose, userId,
}: { disparoId: string | null; onClose: () => void; userId: string }) {
  const [detalhes, setDetalhes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!disparoId) {
      setDetalhes([]);
      return;
    }
    setLoading(true);
    supabase.from("disparos_detalhes").select("*").eq("disparo_id", disparoId).order("created_at", { ascending: false })
      .then(({ data }) => {
        setDetalhes(data ?? []);
        setLoading(false);
      });

    const ch = supabase
      .channel(`dd-${disparoId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "disparos_detalhes", filter: `disparo_id=eq.${disparoId}` },
        (payload) => {
          setDetalhes((prev) => {
            if (payload.eventType === "INSERT") return [payload.new as any, ...prev];
            if (payload.eventType === "UPDATE") return prev.map((r) => r.id === (payload.new as any).id ? payload.new : r);
            if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== (payload.old as any).id);
            return prev;
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [disparoId, userId]);

  return (
    <Sheet open={!!disparoId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Detalhes do disparo</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-2">
          {loading ? <Skeleton className="h-40" /> : detalhes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem detalhes ainda.</p>
          ) : detalhes.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between border-b border-border py-2">
              <div>
                <p className="text-sm font-medium">{d.destinatario}</p>
                <p className="text-xs text-muted-foreground">
                  {d.sent_at ? new Date(d.sent_at).toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              <StatusBadge status={d.status} />
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
