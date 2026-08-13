import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_contatos",
  title: "Listar contatos de uma lista",
  description: "Lista os contatos de uma lista de contatos do usuário autenticado.",
  inputSchema: {
    lista_id: z.string().uuid().describe("ID da lista de contatos."),
    limit: z.number().int().min(1).max(500).default(100).describe("Máximo de contatos retornados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lista_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("contatos")
      .select("id, nome, telefone, var1, var2, var3, created_at")
      .eq("lista_id", lista_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { contatos: data ?? [] },
    };
  },
});
