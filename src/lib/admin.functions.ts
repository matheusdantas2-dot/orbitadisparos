import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "matheusdantas2@gmail.com";

function assertAdmin(claims: any) {
  const email = claims?.email as string | undefined;
  if (!email || email.toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("Forbidden: acesso restrito ao administrador");
  }
}

export const listUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("usuarios")
      .select("id, nome, email, plano_ativo, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const inviteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email(), nome: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { nome: data.nome ?? data.email },
    });
    if (error) throw new Error(error.message);
    return { ok: true, userId: result.user?.id };
  });

export const togglePlanoAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("usuarios")
      .update({ plano_ativo: data.ativo })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
