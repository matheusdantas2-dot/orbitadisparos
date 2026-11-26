# WhatsApp Sender Pro

Crie um SaaS completo chamado "DispararPro" para disparos em massa via WhatsApp. Stack: React + TypeScript + Tailwind CSS + Shadcn/UI. Backend: Supabase (autenticação e banco de dados) + webhooks n8n para ações de disparo.

## DESIGN

- Tema escuro (dark mode padrão), sidebar lateral fixa com ícones + labels

- Paleta: fundo #0f0f0f, cards #1a1a1a, accent verde #22c55e (WhatsApp green)

- Tipografia limpa, badges de status coloridos (enviado=verde, falho=vermelho, pendente=amarelo, pausado=cinza)

## AUTENTICAÇÃO

- Login com email + senha via Supabase Auth

- Verificação de plano/acesso na tabela usuarios (campo plano_ativo: boolean)

- Se plano inativo → tela de "Acesso bloqueado, renove seu plano"

- Persistir sessão com JWT

## ESTRUTURA DE PÁGINAS (sidebar)

1. Dashboard

2. Conexões (instâncias WhatsApp)

3. Listas de Contatos

4. Grupos WhatsApp

5. Novo Disparo

6. Histórico de Disparos

7. Configurações (API Key IA)

## PÁGINA: DASHBOARD

Cards de métricas: total de disparos hoje, disparos com sucesso (verde), disparos com falha (vermelho), conexões ativas. Gráfico de linha: disparos por dia (últimos 7 dias). Dados vêm do Supabase, tabela disparos.

## PÁGINA: CONEXÕES

Lista de conexões do usuário (tabela conexoes): nome, número, status (conectado/desconectado), foto de perfil.

Botões por conexão: "Atualizar foto de perfil" → chama webhook n8n BUSCAR_FOTO_PERFIL, "Deslogar" → chama webhook n8n DESLOGAR_INSTANCIA, "Deletar" → chama webhook n8n DELETAR_INSTANCIA + deleta do Supabase.

Botão "Nova Conexão": modal com campo "Nome da conexão" → chama webhook n8n CRIAR_INSTANCIA → exibe QR Code retornado → polling a cada 3s no webhook VERIFICAR_CONEXAO até status = "connected".

## PÁGINA: LISTAS DE CONTATOS

Lista de listas criadas (tabela listas): nome, qtd de contatos, data criação.

Ações: criar lista, excluir lista, abrir lista.

Ao abrir uma lista: tabela de contatos com colunas dinâmicas (nome, telefone + variáveis var1, var2, var3). Botão "Importar CSV" → upload de arquivo CSV, parse no frontend, salvar contatos em lote no Supabase (tabela contatos). Botão "Excluir contato" por linha.

## PÁGINA: GRUPOS WHATSAPP

Seletor de conexão ativa no topo. Botão "Buscar grupos" → chama webhook n8n LISTAR_GRUPOS → salva no Supabase tabela grupos. Lista de grupos: nome, participantes, foto. Checkbox para selecionar grupos. Botão "Exportar participantes" → chama webhook n8n EXPORTAR_PARTICIPANTES.

## PÁGINA: NOVO DISPARO

Wizard em 4 etapas (stepper):

Etapa 1 — Configuração: nome do disparo, tipo Contatos ou Grupos (toggle), selecionar conexão (dropdown), intervalo entre mensagens mínimo e máximo em segundos (dois sliders), agendamento imediato ou data/hora específica (date-time picker).

Etapa 2 — Destinatários: se Contatos → selecionar lista(s) com preview de quantidade; se Grupos → checkboxes com nome e qtd participantes.

Etapa 3 — Mensagem: textarea com suporte a variáveis {{nome}} {{var1}} {{var2}} {{var3}}, preview ao vivo substituindo variáveis com dados do 1º contato, tipo de anexo (nenhum/imagem/vídeo/documento/áudio), upload de arquivo → base64. Botão "Gerar com IA" → modal com campo de prompt → chama webhook n8n GERAR_MENSAGEM_IA → preenche textarea.

Etapa 4 — Confirmar: resumo completo + botão "Iniciar disparo" → chama webhook n8n SALVAR_DISPAROS ou SALVAR_DISPARO_GRUPO → toast de confirmação.

## PÁGINA: HISTÓRICO DE DISPAROS

Tabela: Nome, Tipo, Conexão, Status, Total, Enviados, Falhos, Data. Filtros por status, data, conexão. Por linha: botão "Detalhes" → drawer lateral com lista de cada mensagem (destinatário, status, timestamp); botões Pausar, Retomar, Excluir → chamam webhooks n8n correspondentes.

## PÁGINA: CONFIGURAÇÕES

Campo para salvar API Key de IA (OpenAI/Anthropic) → salva via webhook n8n SALVAR_APIKEY. Seção de perfil do usuário (nome, email).

## ARQUIVO DE WEBHOOKS

Criar src/lib/webhooks.ts com todas as chamadas usando VITE_N8N_BASE_URL como base. Funções: criarInstancia, deletarInstancia, deslogarInstancia, buscarFotoPerfil, listarGrupos, exportarParticipantes, salvarDisparos, salvarDisparoGrupo, pausarDisparo, retomar, excluirDisparo, gerarMensagemIA, salvarApikey. Todas as funções fazem POST com o body em JSON e retornam o response.json().

## SUPABASE REALTIME

Na tela de detalhes de um disparo, usar supabase.channel() para ouvir mudanças na tabela disparos_detalhes em tempo real e atualizar o progresso ao vivo.

## VARIÁVEIS DE AMBIENTE

VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_N8N_BASE_URL

## REQUISITOS GERAIS

- Todos os estados de loading com skeleton ou spinner

- Toasts para feedback de todas as ações (sucesso e erro)

- Responsivo para desktop (foco) e mobile

- Modais com confirmação para ações destrutivas (deletar, excluir)

- Não usar tag HTML form, usar onClick e onChange nos botões e inputs

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://orbitadisparos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d7b6d451-788d-4e92-a0f5-d7fd5389cda7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
