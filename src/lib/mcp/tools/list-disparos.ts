import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_disparos",
  title: "Listar disparos",
  description: "Lista as campanhas de disparo do usuário autenticado com status e progresso.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Filtro opcional de status (ex.: enviando, concluido, pausado)."),
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de campanhas retornadas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("disparos")
      .select("id, nome, tipo, status, total, enviados, falhos, agendamento, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { disparos: data ?? [] },
    };
  },
});
