import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { definirSenhaUsuario } from "@/lib/admin.functions";

export function DefinirSenhaDialog({ userId, email, nome }: { userId: string; email: string; nome?: string | null }) {
  const definir = useServerFn(definirSenhaUsuario);
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");

  const reset = () => { setConfirmEmail(""); setSenha(""); setSenha2(""); };
  const emailOk = confirmEmail.trim().toLowerCase() === (email ?? "").toLowerCase();
  const senhaOk = senha.length >= 8 && senha === senha2;

  const mut = useMutation({
    mutationFn: () => definir({ data: { userId, emailConfirmacao: confirmEmail, novaSenha: senha } }),
    onSuccess: () => { toast.success(`Nova senha definida para ${email}`); reset(); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao definir senha"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><KeyRound className="mr-2 h-3.5 w-3.5" /> Nova senha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir nova senha</DialogTitle>
          <DialogDescription>
            Conta: <strong>{nome ?? "—"}</strong> ({email}). A senha atual não é exibida e será substituída.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Confirme digitando o e-mail da conta</Label>
            <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={email} autoComplete="off" />
            {confirmEmail && !emailOk && <p className="text-xs text-destructive">O e-mail não confere.</p>}
          </div>
          <div className="space-y-2">
            <Label>Nova senha (mín. 8 caracteres)</Label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label>Repita a nova senha</Label>
            <Input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
            {senha2 && senha !== senha2 && <p className="text-xs text-destructive">As senhas não coincidem.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!emailOk || !senhaOk || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
