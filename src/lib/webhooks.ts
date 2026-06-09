// Centraliza todas as chamadas para webhooks n8n.
// Cada função faz POST com o body em JSON e retorna response.json().

const BASE_URL = (import.meta.env.VITE_N8N_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://n8n.grupovlx.com.br/webhook";

async function post<T = any>(path: string, body: Record<string, any>): Promise<T> {
  const url = `${BASE_URL}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook ${path} falhou (${res.status}): ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return (await res.text()) as any;
}

export const webhooks = {
  criarInstancia: (body: { user_id: string; nome: string }) =>
    post<{ qrcode?: string; instance?: string }>("CRIAR_INSTANCIA", body),
  verificarConexao: (body: { user_id: string; instance: string }) =>
    post<{ status: string; numero?: string; foto_url?: string }>("VERIFICAR_CONEXAO", body),
  deletarInstancia: (body: { user_id: string; instance: string }) =>
    post("DELETAR_INSTANCIA", body),
  deslogarInstancia: (body: { user_id: string; instance: string }) =>
    post("DESLOGAR_INSTANCIA", body),
  buscarFotoPerfil: (body: { user_id: string; instance: string }) =>
    post<{ foto_url?: string }>("BUSCAR_FOTO_PERFIL", body),
  listarGrupos: (body: { user_id: string; instance: string }) =>
    post<{ grupos: Array<{ id: string; nome: string; participantes: number; foto_url?: string }> }>(
      "LISTAR_GRUPOS",
      body,
    ),
  exportarParticipantes: (body: { user_id: string; instance: string; grupos: string[] }) =>
    post("EXPORTAR_PARTICIPANTES", body),
  salvarDisparos: (body: Record<string, any>) => post("SALVAR_DISPAROS", body),
  salvarDisparoGrupo: (body: Record<string, any>) => post("SALVAR_DISPARO_GRUPO", body),
  pausarDisparo: (body: { user_id: string; disparo_id: string }) => post("PAUSAR_DISPARO", body),
  retomarDisparo: (body: { user_id: string; disparo_id: string }) => post("RETOMAR_DISPARO", body),
  excluirDisparo: (body: { user_id: string; disparo_id: string }) => post("EXCLUIR_DISPARO", body),
  gerarMensagemIA: (body: { user_id: string; prompt: string }) =>
    post<{ mensagem: string }>("GERAR_MENSAGEM_IA", body),
  salvarApikey: (body: { user_id: string; provider: string; api_key: string }) =>
    post("SALVAR_APIKEY", body),
};
