import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const API_KEY = "vlx-n8n-secret-2024";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.headers.get("x-api-key") !== API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { disparo_id, user_id, destinatario, status, erro } = body ?? {};

    if (!disparo_id || !user_id || !destinatario || !status) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: disparo_id, user_id, destinatario, status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (status !== "enviado" && status !== "falho") {
      return new Response(JSON.stringify({ error: "status deve ser 'enviado' ou 'falho'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertErr } = await supabaseAdmin.from("disparos_detalhes").insert({
      disparo_id,
      user_id,
      destinatario,
      status,
      erro: erro ?? null,
      sent_at: status === "enviado" ? new Date().toISOString() : null,
    });
    if (insertErr) throw insertErr;

    const { data: disparoRow, error: selErr } = await supabaseAdmin
      .from("disparos")
      .select("enviados, falhos")
      .eq("id", disparo_id)
      .single();
    if (selErr) throw selErr;

    const updates: Record<string, number> = {};
    if (status === "enviado") updates.enviados = (disparoRow.enviados ?? 0) + 1;
    else updates.falhos = (disparoRow.falhos ?? 0) + 1;

    const { error: updErr } = await supabaseAdmin
      .from("disparos")
      .update(updates)
      .eq("id", disparo_id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[salvar-progresso] erro:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
