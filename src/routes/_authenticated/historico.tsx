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
                  <TableHead className="min-w-48">Progresso</TableHead>
                  <TableHead>Enviados</TableHead>
                  <TableHead>Falhos</TableHead>
                  <TableHead>Pendentes</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disparos?.map((d: any) => {
                  const total = d.total ?? 0;
                  const enviados = d.enviados ?? 0;
                  const falhos = d.falhos ?? 0;
                  const processados = enviados + falhos;
                  const pendentes = Math.max(0, total - processados);
                  const pctEnv = total > 0 ? (enviados / total) * 100 : 0;
                  const pctFal = total > 0 ? (falhos / total) * 100 : 0;
                  const ativo = d.status === "em_andamento";
                  return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell>{d.tipo}</TableCell>
                    <TableCell>{d.conexoes?.nome ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className={`relative h-2 w-full overflow-hidden rounded-full bg-muted ${ativo ? "animate-pulse" : ""}`}>
                          <div className="absolute inset-y-0 left-0 bg-success transition-all" style={{ width: `${pctEnv}%` }} />
                          <div className="absolute inset-y-0 bg-destructive transition-all" style={{ left: `${pctEnv}%`, width: `${pctFal}%` }} />
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {processados}/{total} ({total > 0 ? Math.round((processados / total) * 100) : 0}%)
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-success tabular-nums">{enviados}</TableCell>
                    <TableCell className="text-destructive tabular-nums">{falhos}</TableCell>
                    <TableCell className="tabular-nums">{pendentes}</TableCell>
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
                  );
                })}
                {disparos?.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Sem disparos</TableCell></TableRow>
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
    pendente: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30", label: "Pendente" },
    em_andamento: { cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/30", label: "Em andamento" },
    pausado: { cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-500/30", label: "Pausado" },
    concluido: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30", label: "Concluído" },
    falho: { cls: "bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/30", label: "Falho" },
    enviado: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30", label: "Enviado" },
  };
  const cfg = map[status] || { cls: "bg-muted text-muted-foreground", label: status };
  return <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
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
