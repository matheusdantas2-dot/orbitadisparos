import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Send, Smartphone } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const uid = user!.id;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", uid],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);

      const [disparos, conexoes, detalhes] = await Promise.all([
        supabase.from("disparos").select("*").eq("user_id", uid).gte("created_at", since.toISOString()),
        supabase.from("conexoes").select("*").eq("user_id", uid).eq("status", "conectado"),
        supabase.from("disparos_detalhes").select("status, created_at").eq("user_id", uid).gte("created_at", since.toISOString()),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const detalhesHoje = (detalhes.data || []).filter((d) => d.created_at >= todayIso);
      const sucessoHoje = detalhesHoje.filter((d) => d.status === "enviado").length;
      const falhaHoje = detalhesHoje.filter((d) => d.status === "falho").length;

      // Por dia, últimos 7 dias
      const days: { dia: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(d.getDate() + 1);
        const total = (detalhes.data || []).filter(
          (x) => x.created_at >= d.toISOString() && x.created_at < next.toISOString(),
        ).length;
        days.push({ dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), total });
      }

      return {
        disparosHoje: detalhesHoje.length,
        sucessoHoje,
        falhaHoje,
        conexoesAtivas: conexoes.data?.length ?? 0,
        days,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral dos seus disparos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Disparos hoje" value={data?.disparosHoje} icon={Send} loading={isLoading} />
        <MetricCard title="Com sucesso" value={data?.sucessoHoje} icon={CheckCircle2} loading={isLoading} accent="text-success" />
        <MetricCard title="Com falha" value={data?.falhaHoje} icon={XCircle} loading={isLoading} accent="text-destructive" />
        <MetricCard title="Conexões ativas" value={data?.conexoesAtivas} icon={Smartphone} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disparos por dia (últimos 7 dias)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.days || []}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  accent,
}: {
  title: string;
  value?: number;
  icon: any;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className={`text-3xl font-bold ${accent ?? ""}`}>{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
