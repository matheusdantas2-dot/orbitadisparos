import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { webhooks } from "@/lib/webhooks";

export const Route = createFileRoute("/_authenticated/grupos")({
  component: GruposPage,
});

function GruposPage() {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [conexaoId, setConexaoId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: conexoes } = useQuery({
    queryKey: ["conexoes-min", uid],
    queryFn: async () => {
      const { data } = await supabase.from("conexoes").select("id, nome, status").eq("user_id", uid);
      return data ?? [];
    },
  });

  const { data: grupos, isLoading } = useQuery({
    queryKey: ["grupos", uid, conexaoId],
    queryFn: async () => {
      if (!conexaoId) return [];
      const { data } = await supabase
        .from("grupos")
        .select("*")
        .eq("user_id", uid)
        .eq("conexao_id", conexaoId)
        .order("nome");
      return data ?? [];
    },
  });

  const conexao = conexoes?.find((c) => c.id === conexaoId);

  const handleBuscar = async () => {
    if (!conexao) return toast.error("Selecione uma conexão");
    setBusy(true);
    try {
      const res: any = await webhooks.listarGrupos({ user_id: uid, instance: conexao.nome });
      const list = res?.grupos || [];
      // sync no banco
      await supabase.from("grupos").delete().eq("user_id", uid).eq("conexao_id", conexaoId);
      if (list.length > 0) {
        await supabase.from("grupos").insert(
          list.map((g: any) => ({
            user_id: uid,
            conexao_id: conexaoId,
            grupo_id_whatsapp: g.id,
            nome: g.nome,
            participantes: g.participantes ?? 0,
            foto_url: g.foto_url,
          })),
        );
      }
      toast.success(`${list.length} grupos sincronizados`);
      qc.invalidateQueries({ queryKey: ["grupos", uid, conexaoId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportar = async () => {
    if (!conexao || selected.size === 0) return toast.error("Selecione grupos");
    try {
      await webhooks.exportarParticipantes({
        user_id: uid,
        instance: conexao.nome,
        grupos: Array.from(selected),
      });
      toast.success("Exportação iniciada");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Grupos WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Sincronize e exporte participantes</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-1 block">Conexão ativa</label>
            <Select value={conexaoId} onValueChange={setConexaoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {conexoes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleBuscar} disabled={busy || !conexaoId}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Buscar grupos
          </Button>
          <Button variant="outline" onClick={handleExportar} disabled={selected.size === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar ({selected.size})
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : grupos && grupos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {grupos.map((g) => (
            <Card key={g.id} className="cursor-pointer" onClick={() => toggle(g.grupo_id_whatsapp)}>
              <CardContent className="flex items-center gap-3 pt-4">
                <Checkbox checked={selected.has(g.grupo_id_whatsapp)} />
                <Avatar>
                  <AvatarImage src={g.foto_url || undefined} />
                  <AvatarFallback>{g.nome.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.nome}</p>
                  <p className="text-xs text-muted-foreground">{g.participantes} participantes</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {conexaoId ? "Nenhum grupo. Clique em 'Buscar grupos'." : "Selecione uma conexão para começar."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
