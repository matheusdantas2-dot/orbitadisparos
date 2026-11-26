import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{"title": "Orbita — Central de Disparo"}, {"name": "description", "content": "Acesse sua central de disparos via WhatsApp na Orbita."}, {"property": "og:title", "content": "Orbita — Central de Disparo"}, {"property": "og:description", "content": "Acesse sua central de disparos via WhatsApp na Orbita."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
}
