// Centraliza todas as chamadas para webhooks n8n.
// Cada função faz POST com o body em JSON e retorna response.json().
//
// NOTA sobre CORS: "Access-Control-Allow-*" são headers de RESPOSTA do servidor,
// não de requisição. Se o n8n retorna "Failed to fetch", o servidor n8n precisa
// habilitar CORS para o domínio do app (responder com
// Access-Control-Allow-Origin: * ou o origin do app, e tratar OPTIONS preflight).
// Aqui garantimos mode:'cors' e logging detalhado do erro real.

const BASE_URL = (import.meta.env.VITE_N8N_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://n8n.grupovlx.com.br/webhook";

async function post<T = any>(path: string, body: Record<string, any>): Promise<T> {
  const url = `${BASE_URL}/${path.replace(/^\//, "")}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `Webhook ${path} falhou (${res.status}): ${text || res.statusText}`;
      console.error("[webhooks]", msg, { url, body });
      throw new Error(msg);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return (await res.text()) as any;
  } catch (err: any) {
    // TypeError: Failed to fetch geralmente significa CORS / DNS / rede / mixed-content.
    const isCors = err?.name === "TypeError" && /fetch/i.test(err?.message || "");
    console.error("[webhooks] erro ao chamar", url, {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      provavelCausa: isCors
        ? "CORS bloqueado pelo navegador, servidor offline, DNS inválido ou mixed-content. Habilite CORS no n8n (Access-Control-Allow-Origin) e responda ao OPTIONS preflight."
        : undefined,
      url,
      body,
    });
    if (isCors) {
      throw new Error(
        `Não foi possível chamar ${path}. Verifique se o webhook n8n existe em ${url} e se o CORS está habilitado para este domínio.`,
      );
    }
    throw err;
  }
}

export const webhooks = {
  criarInstancia: (body: { user_id: string; nome: string }) =>
    post<{ qrcode?: string; instance?: string }>("webhook/criarconexaoback", body),
  verificarConexao: (body: { user_id: string; instance: string }) =>
    post<{ status: string; numero?: string; foto_url?: string }>("webhook/verificar-login", body),
  deletarInstancia: (body: { user_id: string; instance: string }) =>
    post("webhook/apagarconexaoback", body),
  deslogarInstancia: (body: { user_id: string; instance: string }) =>
    post("webhook/apagarconexaoback", body),
  buscarFotoPerfil: (body: { user_id: string; instance: string }) =>
    post<{ foto_url?: string }>("webhook/verificar-login", body),
  listarGrupos: (body: { user_id: string; instance: string }) =>
    post<{ grupos: Array<{ id: string; nome: string; participantes: number; foto_url?: string }> }>(
      "webhook/listar-grupos",
      body,
    ),
  exportarParticipantes: (body: { user_id: string; instance: string; grupos: string[] }) =>
    post("webhook/listar-grupos", body),
  salvarDisparos: (body: Record<string, any>) => post("webhook/disparar", body),
  salvarDisparoGrupo: (body: Record<string, any>) => post("webhook/disparar", body),
  pausarDisparo: (body: { user_id: string; disparo_id: string }) => post("webhook/pausar-disparo", body),
  retomarDisparo: (body: { user_id: string; disparo_id: string }) => post("webhook/retomar-disparo", body),
  excluirDisparo: (body: { user_id: string; disparo_id: string }) => post("webhook/excluir-disparo", body),
  gerarMensagemIA: (body: { user_id: string; prompt: string }) =>
    post<{ mensagem: string }>("webhook/gerarmensagem-ia", body),
  salvarApikey: (body: { user_id: string; provider: string; api_key: string }) =>
    post("webhook/salvar-gpt", body),
};
