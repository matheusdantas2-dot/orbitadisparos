import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, Loader2, Send, Wifi, WifiOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { webhooks } from "@/lib/webhooks";

export const Route = createFileRoute("/_authenticated/novo-disparo")({
  component: NovoDisparo,
});

type Tipo = "contatos" | "grupos";

function NovoDisparo() {
  const { user } = useAuth();
  const uid = user!.id;
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<Tipo>("contatos");
  const [conexoesSel, setConexoesSel] = useState<Set<string>>(new Set());
  const [intMin, setIntMin] = useState(5);
  const [intMax, setIntMax] = useState(15);
  const [agendarTipo, setAgendarTipo] = useState<"imediato" | "agendado">("imediato");
  const [agendamento, setAgendamento] = useState("");

  const [listasSel, setListasSel] = useState<Set<string>>(new Set());
  const [gruposSel, setGruposSel] = useState<Set<string>>(new Set());

  const [mensagem, setMensagem] = useState("");
  const [anexoTipo, setAnexoTipo] = useState<string>("nenhum");
  const [anexoBase64, setAnexoBase64] = useState<string>("");


  const [enviando, setEnviando] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const inserirVariavel = (variavel: string) => {
    const token = `{{${variavel}}}`;
    const el = msgRef.current;
    if (!el) {
      setMensagem((m) => m + token);
      return;
    }
    const start = el.selectionStart ?? mensagem.length;
    const end = el.selectionEnd ?? mensagem.length;
    const novo = mensagem.slice(0, start) + token + mensagem.slice(end);
    setMensagem(novo);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const { data: conexoes } = useQuery({
    queryKey: ["conx-min", uid],
    queryFn: async () =>
      (await supabase.from("conexoes").select("id, nome, status, numero").eq("user_id", uid)).data ?? [],
    refetchInterval: 10000,
  });

  const primeiraConexaoId = useMemo(() => Array.from(conexoesSel)[0] ?? "", [conexoesSel]);

  const { data: listas } = useQuery({
    queryKey: ["listas-min", uid],
    queryFn: async () => (await supabase.from("listas").select("id, nome, contatos(count)").eq("user_id", uid)).data ?? [],
  });

  const { data: grupos } = useQuery({
    queryKey: ["grupos-min", uid, primeiraConexaoId],
    queryFn: async () => {
      if (!primeiraConexaoId) return [];
      return (await supabase.from("grupos").select("*").eq("user_id", uid).eq("conexao_id", primeiraConexaoId)).data ?? [];
    },
  });

  const { data: primeiroContato } = useQuery({
    queryKey: ["primeiro-contato", Array.from(listasSel)],
    queryFn: async () => {
      const ids = Array.from(listasSel);
      if (ids.length === 0) return null;
      const { data } = await supabase.from("contatos").select("*").in("lista_id", ids).limit(1).maybeSingle();
      return data;
    },
  });

  const preview = useMemo(() => {
    if (!primeiroContato) return mensagem;
    return mensagem
      .replace(/\{\{\s*nome\s*\}\}/gi, primeiroContato.nome || "")
      .replace(/\{\{\s*var1\s*\}\}/gi, primeiroContato.var1 || "")
      .replace(/\{\{\s*var2\s*\}\}/gi, primeiroContato.var2 || "")
      .replace(/\{\{\s*var3\s*\}\}/gi, primeiroContato.var3 || "");
  }, [mensagem, primeiroContato]);

  const totalDestinatarios = useMemo(() => {
    if (tipo === "contatos") {
      return (listas || [])
        .filter((l: any) => listasSel.has(l.id))
        .reduce((s: number, l: any) => s + (l.contatos?.[0]?.count ?? 0), 0);
    }
    return (grupos || []).filter((g) => gruposSel.has(g.grupo_id_whatsapp))
      .reduce((s, g) => s + (g.participantes ?? 0), 0);
  }, [tipo, listas, grupos, listasSel, gruposSel]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setAnexoBase64(String(reader.result));
    reader.readAsDataURL(f);
  };


  const handleEnviar = async () => {
    const selecionadas = (conexoes ?? []).filter((c: any) => conexoesSel.has(c.id));
    if (selecionadas.length === 0) return toast.error("Selecione ao menos uma conexão");
    const offline = selecionadas.filter((c: any) => c.status !== "conectado");
    if (offline.length > 0) return toast.error(`Conexão offline selecionada: ${offline.map((c: any) => c.nome).join(", ")}`);
    setEnviando(true);
    try {
      const agendado = agendarTipo === "agendado" ? agendamento : null;
      const { data: disparoRow, error: insertErr } = await supabase
        .from("disparos")
        .insert({
          user_id: uid,
          nome,
          tipo,
          conexao_id: selecionadas[0].id,
          status: agendado ? "pendente" : "em_andamento",
          total: totalDestinatarios,
          enviados: 0,
          falhos: 0,
          mensagem,
          anexo_tipo: anexoTipo === "nenhum" ? null : anexoTipo,
          anexo_base64: anexoBase64 || null,
          intervalo_min: intMin,
          intervalo_max: intMax,
          agendamento: agendado,
        })
        .select()
        .single();
      if (insertErr) {
        console.error("[novo-disparo] erro ao inserir disparo:", insertErr);
        toast.error(`Erro ao criar disparo: ${insertErr.message}`);
        throw insertErr;
      }
      if (!disparoRow?.id) {
        const msg = "Disparo criado sem id retornado";
        console.error("[novo-disparo]", msg, disparoRow);
        toast.error(msg);
        throw new Error(msg);
      }

      const payload = {
        user_id: uid,
        disparo_id: disparoRow.id,
        nome,
        tipo,
        conexao_id: selecionadas[0].id,
        instance: selecionadas[0].nome,
        conexoes: selecionadas.map((c: any) => ({ id: c.id, instance: c.nome, numero: c.numero })),
        intervalo_min: intMin,
        intervalo_max: intMax,
        agendamento: agendado,
        mensagem,
        anexo_tipo: anexoTipo === "nenhum" ? null : anexoTipo,
        anexo_base64: anexoBase64 || null,
        listas: Array.from(listasSel),
        grupos: Array.from(gruposSel),
      };
      console.log("[novo-disparo] payload enviado ao webhook:", {
        ...payload,
        anexo_base64: payload.anexo_base64 ? `<${payload.anexo_base64.length} chars>` : null,
      });
      try {
        if (tipo === "contatos") await webhooks.salvarDisparos(payload);
        else await webhooks.salvarDisparoGrupo(payload);
      } catch (webhookErr: any) {
        await supabase.from("disparos").update({ status: "falho" }).eq("id", disparoRow.id);
        throw webhookErr;
      }
      toast.success("Disparo iniciado!");
      navigate({ to: "/historico" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const conexoesSelLista = (conexoes ?? []).filter((c: any) => conexoesSel.has(c.id));

  const canNext =
    (step === 1 && nome && conexoesSel.size > 0) ||
    (step === 2 && ((tipo === "contatos" && listasSel.size > 0) || (tipo === "grupos" && gruposSel.size > 0))) ||
    (step === 3 && mensagem.trim().length > 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Novo Disparo</h1>
        <p className="text-sm text-muted-foreground">Configure seu disparo em 4 etapas</p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do disparo</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Promoção Outubro" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as Tipo)} className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="contatos" /> Contatos
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="grupos" /> Grupos
                </label>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conexões (selecione uma ou mais)</Label>
                <span className="text-xs text-muted-foreground">
                  {conexoesSel.size} selecionada{conexoesSel.size === 1 ? "" : "s"}
                </span>
              </div>
              {conexoes && conexoes.length > 0 ? (
                <div className="space-y-2">
                  {conexoes.map((c: any) => {
                    const online = c.status === "conectado";
                    const pendente = c.status === "pendente";
                    const checked = conexoesSel.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${
                          online ? "cursor-pointer hover:bg-accent" : "opacity-60 cursor-not-allowed"
                        } ${checked ? "border-primary bg-accent/30" : "border-border"}`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!online}
                          onCheckedChange={() => {
                            if (!online) return;
                            const n = new Set(conexoesSel);
                            n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            setConexoesSel(n);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.nome}</div>
                          {c.numero && <div className="text-xs text-muted-foreground truncate">{c.numero}</div>}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                            online
                              ? "bg-success/15 text-success"
                              : pendente
                              ? "bg-warning/15 text-warning"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {online ? (
                            <>
                              <Wifi className="h-3 w-3" /> Online
                            </>
                          ) : pendente ? (
                            <>
                              <Clock className="h-3 w-3" /> Pendente
                            </>
                          ) : (
                            <>
                              <WifiOff className="h-3 w-3" /> Offline
                            </>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conexão. Crie em "Conexões WhatsApp".
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Intervalo mínimo: {intMin}s</Label>
                <Slider value={[intMin]} onValueChange={(v) => setIntMin(v[0])} min={1} max={120} step={1} />
              </div>
              <div className="space-y-2">
                <Label>Intervalo máximo: {intMax}s</Label>
                <Slider value={[intMax]} onValueChange={(v) => setIntMax(v[0])} min={1} max={300} step={1} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <RadioGroup value={agendarTipo} onValueChange={(v) => setAgendarTipo(v as any)} className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="imediato" /> Imediato
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="agendado" /> Data/hora
                </label>
              </RadioGroup>
              {agendarTipo === "agendado" && (
                <Input type="datetime-local" value={agendamento} onChange={(e) => setAgendamento(e.target.value)} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Destinatários</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tipo === "contatos" ? (
              listas && listas.length > 0 ? listas.map((l: any) => (
                <label key={l.id} className="flex items-center gap-3 p-3 border border-border rounded-md cursor-pointer hover:bg-accent">
                  <Checkbox
                    checked={listasSel.has(l.id)}
                    onCheckedChange={() => {
                      const n = new Set(listasSel);
                      n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                      setListasSel(n);
                    }}
                  />
                  <span className="flex-1">{l.nome}</span>
                  <span className="text-sm text-muted-foreground">{l.contatos?.[0]?.count ?? 0} contatos</span>
                </label>
              )) : <p className="text-sm text-muted-foreground">Nenhuma lista. Crie em "Listas de Contatos".</p>
            ) : (
              grupos && grupos.length > 0 ? grupos.map((g) => (
                <label key={g.id} className="flex items-center gap-3 p-3 border border-border rounded-md cursor-pointer hover:bg-accent">
                  <Checkbox
                    checked={gruposSel.has(g.grupo_id_whatsapp)}
                    onCheckedChange={() => {
                      const n = new Set(gruposSel);
                      n.has(g.grupo_id_whatsapp) ? n.delete(g.grupo_id_whatsapp) : n.add(g.grupo_id_whatsapp);
                      setGruposSel(n);
                    }}
                  />
                  <span className="flex-1">{g.nome}</span>
                  <span className="text-sm text-muted-foreground">{g.participantes} part.</span>
                </label>
              )) : <p className="text-sm text-muted-foreground">Nenhum grupo. Sincronize em "Grupos WhatsApp".</p>
            )}
            <p className="text-sm pt-2">Total estimado: <span className="font-bold">{totalDestinatarios}</span></p>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Mensagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Texto da mensagem</Label>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Inserir variável:</span>
                {[
                  { key: "nome", label: "Nome" },
                  { key: "var1", label: "Var 1" },
                  { key: "var2", label: "Var 2" },
                  { key: "var3", label: "Var 3" },
                ].map((v) => (
                  <Button
                    key={v.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs font-mono"
                    onClick={() => inserirVariavel(v.key)}
                  >
                    {`{{${v.key}}}`}
                  </Button>
                ))}
              </div>
              <Textarea
                ref={msgRef}
                rows={6}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Olá {{nome}}, ..."
              />
              <p className="text-xs text-muted-foreground">
                Clique nos botões acima para inserir a variável na posição do cursor. Elas serão substituídas pelos dados de cada contato no envio.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Preview (1º contato)</Label>
              <div className="p-3 rounded-md bg-muted text-sm whitespace-pre-wrap min-h-16">{preview || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de anexo</Label>
                <Select value={anexoTipo} onValueChange={setAnexoTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    <SelectItem value="imagem">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="documento">Documento</SelectItem>
                    <SelectItem value="audio">Áudio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {anexoTipo !== "nenhum" && (
                <div className="space-y-2">
                  <Label>Arquivo</Label>
                  <Input type="file" onChange={handleFile} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Confirmar</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nome" value={nome} />
            <Row label="Tipo" value={tipo} />
            <Row label="Conexões" value={conexoesSelLista.map((c: any) => c.nome).join(", ") || "—"} />
            <Row label="Intervalo" value={`${intMin}s – ${intMax}s`} />
            <Row label="Agendamento" value={agendarTipo === "imediato" ? "Imediato" : new Date(agendamento).toLocaleString("pt-BR")} />
            <Row label="Destinatários" value={String(totalDestinatarios)} />
            <Row label="Anexo" value={anexoTipo} />
            <div className="pt-3">
              <Label>Mensagem (preview)</Label>
              <div className="mt-1 p-3 rounded-md bg-muted whitespace-pre-wrap">{preview}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Próximo <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleEnviar} disabled={enviando}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Iniciar disparo
          </Button>
        )}
      </div>

      <Dialog open={iaOpen} onOpenChange={setIaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar mensagem com IA</DialogTitle></DialogHeader>
          <Textarea rows={4} value={iaPrompt} onChange={(e) => setIaPrompt(e.target.value)} placeholder="Ex: mensagem promocional de Black Friday com 20% off..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIaOpen(false)}>Cancelar</Button>
            <Button onClick={handleIA} disabled={iaBusy}>
              {iaBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Configuração", "Destinatários", "Mensagem", "Confirmar"];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold
              ${active ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
              {n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{l}</span>
            {n < labels.length && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
