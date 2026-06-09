
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- usuarios (profile)
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  plano_ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usuario select" ON public.usuarios FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own usuario update" ON public.usuarios FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "own usuario insert" ON public.usuarios FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, plano_ativo)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- conexoes
CREATE TABLE public.conexoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  numero TEXT,
  status TEXT NOT NULL DEFAULT 'desconectado',
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conexoes TO authenticated;
GRANT ALL ON public.conexoes TO service_role;
ALTER TABLE public.conexoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conexoes all" ON public.conexoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_conexoes_updated BEFORE UPDATE ON public.conexoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- listas
CREATE TABLE public.listas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listas TO authenticated;
GRANT ALL ON public.listas TO service_role;
ALTER TABLE public.listas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own listas all" ON public.listas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_listas_updated BEFORE UPDATE ON public.listas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- contatos
CREATE TABLE public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id UUID NOT NULL REFERENCES public.listas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  telefone TEXT NOT NULL,
  var1 TEXT,
  var2 TEXT,
  var3 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;
GRANT ALL ON public.contatos TO service_role;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contatos all" ON public.contatos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_contatos_lista ON public.contatos(lista_id);

-- grupos
CREATE TABLE public.grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conexao_id UUID REFERENCES public.conexoes(id) ON DELETE CASCADE,
  grupo_id_whatsapp TEXT NOT NULL,
  nome TEXT NOT NULL,
  participantes INTEGER DEFAULT 0,
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos TO authenticated;
GRANT ALL ON public.grupos TO service_role;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own grupos all" ON public.grupos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- disparos
CREATE TABLE public.disparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'contatos',
  conexao_id UUID REFERENCES public.conexoes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  total INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  falhos INTEGER NOT NULL DEFAULT 0,
  mensagem TEXT,
  anexo_tipo TEXT,
  anexo_base64 TEXT,
  intervalo_min INTEGER NOT NULL DEFAULT 5,
  intervalo_max INTEGER NOT NULL DEFAULT 15,
  agendamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disparos TO authenticated;
GRANT ALL ON public.disparos TO service_role;
ALTER TABLE public.disparos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own disparos all" ON public.disparos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_disparos_updated BEFORE UPDATE ON public.disparos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- disparos_detalhes
CREATE TABLE public.disparos_detalhes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id UUID NOT NULL REFERENCES public.disparos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disparos_detalhes TO authenticated;
GRANT ALL ON public.disparos_detalhes TO service_role;
ALTER TABLE public.disparos_detalhes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own disparos_detalhes all" ON public.disparos_detalhes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_disparos_detalhes_disparo ON public.disparos_detalhes(disparo_id);

-- configuracoes
CREATE TABLE public.configuracoes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ia_api_key TEXT,
  ia_provider TEXT DEFAULT 'openai',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own config all" ON public.configuracoes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_configuracoes_updated BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_detalhes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conexoes;
