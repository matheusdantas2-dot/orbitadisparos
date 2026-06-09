import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { webhooks } from "@/lib/webhooks";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const { user, usuario, refreshUsuario } = useAuth();
  const uid = user!.id;
  const [nome, setNome] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNome(usuario?.nome ?? "");
    supabase.from("configuracoes").select("*").eq("user_id", uid).maybeSingle().then(({ data }) => {
      if (data) {
        setProvider(data.ia_provider ?? "openai");
        setApiKey(data.ia_api_key ?? "");
      }
    });
  }, [usuario, uid]);

  const salvarPerfil = async () => {
    setBusy(true);
    const { error } = await supabase.from("usuarios").update({ nome }).eq("id", uid);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    refreshUsuario();
  };

  const salvarApi = async () => {
    if (!apiKey.trim()) return toast.error("Informe a API key");
    setBusy(true);
    try {
      await supabase.from("configuracoes").upsert({
        user_id: uid, ia_provider: provider, ia_api_key: apiKey,
      });
      await webhooks.salvarApikey({ user_id: uid, provider, api_key: apiKey });
      toast.success("API Key salva");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Perfil e integrações</p>
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

      <Card>
        <CardHeader>
          <CardTitle>API Key de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          </div>
          <Button onClick={salvarApi} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar API Key
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
