import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_lista",
  title: "Criar lista de contatos",
  description: "Cria uma nova lista de contatos vazia para o usuário autenticado.",
  inputSchema: { nome: z.string().trim().min(1).describe("Nome da lista.") },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ nome }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("listas")
      .insert({ nome, user_id: ctx.getUserId()! })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { lista: data },
    };
  },
});
