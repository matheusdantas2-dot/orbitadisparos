import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Plus, RefreshCw, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { webhooks } from "@/lib/webhooks";

export const Route = createFileRoute("/_authenticated/conexoes")({
  component: ConexoesPage,
});

function ConexoesPage() {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();

  const { data: conexoes, isLoading } = useQuery({
    queryKey: ["conexoes", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conexoes")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [openNew, setOpenNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["conexoes", uid] });

  const handleAtualizarFoto = async (c: any) => {
    try {
      const res: any = await webhooks.buscarFotoPerfil({ user_id: uid, instance: c.nome });
      if (res?.foto_url) {
        await supabase.from("conexoes").update({ foto_url: res.foto_url }).eq("id", c.id);
        toast.success("Foto atualizada");
        refresh();
      } else toast.info("Sem foto retornada");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeslogar = async (c: any) => {
    try {
      await webhooks.deslogarInstancia({ user_id: uid, instance: c.nome });
      await supabase.from("conexoes").update({ status: "desconectado" }).eq("id", c.id);
      toast.success("Desconectado");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReconectar = async (c: any) => {
    try {
      await webhooks.reconectarInstancia({ user_id: uid, instance: c.nome });
      toast.success("Reconexão iniciada");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeletar = async () => {
    const c = conexoes?.find((x) => x.id === deleteId);
    if (!c) return;
    try {
      await webhooks.deletarInstancia({ user_id: uid, instance: c.nome });
      await supabase.from("conexoes").delete().eq("id", c.id);
      toast.success("Conexão excluída");
      setDeleteId(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conexões</h1>
          <p className="text-sm text-muted-foreground">Suas instâncias WhatsApp</p>
        </div>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova conexão
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : conexoes && conexoes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conexoes.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Avatar>
                  <AvatarImage src={c.foto_url || undefined} />
                  <AvatarFallback>{c.nome.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <CardTitle className="truncate text-base">{c.nome}</CardTitle>
                  <p className="text-xs text-muted-foreground truncate">{c.numero || "—"}</p>
                </div>
                <StatusBadge status={c.status} />
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleReconectar(c)}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Reconectar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteId(c.id)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Excluir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma conexão. Clique em "Nova conexão" para começar.
          </CardContent>
        </Card>
      )}

      <NovaConexaoDialog open={openNew} onOpenChange={setOpenNew} onCreated={refresh} userId={uid} />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A instância será removida do WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletar}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: any; label: string }> = {
    conectado: { v: "default", label: "Conectado" },
    desconectado: { v: "secondary", label: "Desconectado" },
    pendente: { v: "outline", label: "Pendente" },
  };
  const cfg = map[status] || { v: "secondary", label: status };
  return <Badge variant={cfg.v}>{cfg.label}</Badge>;
}

function NovaConexaoDialog({
  open,
  onOpenChange,
  onCreated,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  userId: string;
}) {
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [instance, setInstance] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setNome("");
      setBusy(false);
      setQrcode(null);
      setInstance(null);
      if (pollRef.current) window.clearInterval(pollRef.current);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!nome.trim()) return toast.error("Informe um nome");
    setBusy(true);
    try {
      const res: any = await webhooks.criarInstancia({ user_id: userId, nome });
      // resposta pode vir como array [{ instance, qrcode }] ou objeto direto
      const payload = Array.isArray(res) ? res[0] : res;
      const rawName =
        payload?.instance?.instanceName ??
        payload?.instanceName ??
        payload?.instance_name ??
        nome;
      const inst = typeof rawName === "string" && rawName.trim() ? rawName.trim() : nome;
      const qr = payload?.qrcode?.base64 || payload?.qrcode || payload?.base64 || null;
      setInstance(inst);
      if (qr) setQrcode(qr);
      // criar registro pendente
      await supabase.from("conexoes").insert({
        user_id: userId,
        nome: inst,
        status: "pendente",
      });
      // poll a cada 3s no verificar-login
      pollRef.current = window.setInterval(async () => {
        try {
          const v: any = await webhooks.verificarConexao({ instanceName: inst });
          const data = Array.isArray(v) ? v[0] : v;
          const state = data?.instance?.state;
          if (state === "open") {
            if (pollRef.current) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            await supabase
              .from("conexoes")
              .update({
                status: "conectado",
                numero: data?.instance?.number || data?.numero,
                foto_url: data?.instance?.profilePictureUrl || data?.foto_url,
              })
              .eq("user_id", userId)
              .eq("nome", inst);
            toast.success("WhatsApp conectado!");
            onCreated();
            onOpenChange(false);
          }
        } catch {}
      }, 3000) as any;

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conexão WhatsApp</DialogTitle>
          <DialogDescription>Escaneie o QR Code no app do WhatsApp.</DialogDescription>
        </DialogHeader>
        {!qrcode ? (
          <div className="space-y-3">
            <Label htmlFor="nome">Nome da conexão</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Atendimento 01" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <img
              src={qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`}
              alt="QR Code"
              className="h-64 w-64 rounded-md bg-white p-2"
            />
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguardando conexão...
            </p>
          </div>
        )}
        <DialogFooter>
          {!qrcode && (
            <Button onClick={handleCreate} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar QR
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
