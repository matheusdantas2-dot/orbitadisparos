import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_contato",
  title: "Adicionar contato",
  description: "Adiciona um contato a uma lista de contatos do usuário autenticado.",
  inputSchema: {
    lista_id: z.string().uuid().describe("ID da lista de destino."),
    telefone: z.string().trim().min(8).describe("Telefone com DDD, apenas números."),
    nome: z.string().trim().optional().describe("Nome do contato."),
    var1: z.string().trim().optional(),
    var2: z.string().trim().optional(),
    var3: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("contatos")
      .insert({
        lista_id: input.lista_id,
        telefone: input.telefone.replace(/\D/g, ""),
        nome: input.nome ?? null,
        var1: input.var1 ?? null,
        var2: input.var2 ?? null,
        var3: input.var3 ?? null,
        user_id: ctx.getUserId()!,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { contato: data },
    };
  },
});
