import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DefinirSenhaDialog } from "@/components/DefinirSenhaDialog";
import { listUsuarios, inviteUsuario, togglePlanoAtivo } from "@/lib/admin.functions";

const ADMIN_EMAIL = "matheusdantas2@gmail.com";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{"title": "Administração | Orbita"}, {"name": "description", "content": "Administre usuários e acessos da central Orbita."}, {"property": "og:title", "content": "Administração | Orbita"}, {"property": "og:description", "content": "Administre usuários e acessos da central Orbita."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listUsuarios);
  const invite = useServerFn(inviteUsuario);
  const toggle = useServerFn(togglePlanoAtivo);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ["admin", "usuarios"],
    queryFn: () => list(),
    enabled: isAdmin,
  });

  const inviteMut = useMutation({
    mutationFn: (v: { email: string; nome?: string }) => invite({ data: v }),
    onSuccess: () => {
      toast.success("Convite enviado");
      setOpen(false);
      setEmail("");
      setNome("");
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao convidar"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { userId: string; ativo: boolean }) => toggle({ data: v }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários e acessos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> Convidar usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convidar usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome (opcional)</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@email.com" />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={inviteMut.isPending || !email}
                onClick={() => inviteMut.mutate({ email, nome: nome || undefined })}
              >
                {inviteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usuarios ?? []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap " +
                          (u.plano_ativo
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400")
                        }
                      >
                        {u.plano_ativo ? "Ativo" : "Bloqueado"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                      <DefinirSenhaDialog userId={u.id} email={u.email} nome={u.nome} />
                      <Button
                        size="sm"
                        variant={u.plano_ativo ? "outline" : "default"}
                        disabled={toggleMut.isPending}
                        onClick={() => toggleMut.mutate({ userId: u.id, ativo: !u.plano_ativo })}
                      >
                        {u.plano_ativo ? (
                          <>
                            <Lock className="mr-2 h-3.5 w-3.5" /> Bloquear
                          </>
                        ) : (
                          <>
                            <Unlock className="mr-2 h-3.5 w-3.5" /> Desbloquear
                          </>
                        )}
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(usuarios ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
