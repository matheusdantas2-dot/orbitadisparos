import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConexoes from "./tools/list-conexoes";
import listListas from "./tools/list-listas";
import listContatos from "./tools/list-contatos";
import listDisparos from "./tools/list-disparos";
import createLista from "./tools/create-lista";
import addContato from "./tools/add-contato";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "orbita",
  title: "Orbita",
  version: "0.1.0",
  instructions:
    "Ferramentas do Orbita (central de disparo WhatsApp). Consulte conexões, listas de contatos, contatos e campanhas de disparo do usuário autenticado, e crie listas/contatos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listConexoes, listListas, listContatos, listDisparos, createLista, addContato],
});
