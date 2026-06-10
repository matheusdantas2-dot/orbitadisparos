import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const { user, usuario, refreshUsuario } = useAuth();
  const uid = user!.id;
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNome(usuario?.nome ?? "");
  }, [usuario]);

  const salvarPerfil = async () => {
    setBusy(true);
    const { error } = await supabase.from("usuarios").update({ nome }).eq("id", uid);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    refreshUsuario();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Perfil do usuário</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <Button onClick={salvarPerfil} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar perfil
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
