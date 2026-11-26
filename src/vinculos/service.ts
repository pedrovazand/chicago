import type { ClienteRone } from "../rone/client.ts";
import type { ContaJogo, PerfilRone } from "../rone/types.ts";
import type { RepositorioVinculos } from "./repository.ts";
import { ErroVinculo, validarIdentidade } from "./types.ts";

// Chamado apenas após o usuário enviar o código no modal privado.
export async function concluirVinculo(
  discordId: string, conta: ContaJogo, codigo: string,
  api: Pick<ClienteRone, "autenticar" | "consultarPerfil">,
  repositorio: Pick<RepositorioVinculos, "inserir">,
): Promise<PerfilRone> {
  validarIdentidade({ discordId, ...conta });
  const sessao = await api.autenticar(conta, codigo);
  if (sessao.jogadorId !== conta.jogadorId || sessao.servidorId !== conta.servidorId) {
    throw new ErroVinculo("conta_divergente", "O login não confirmou a conta solicitada.");
  }
  const perfil = await api.consultarPerfil(sessao.jwt);
  if (perfil.jogadorId !== conta.jogadorId || perfil.servidorId !== conta.servidorId) {
    throw new ErroVinculo("conta_divergente", "O perfil não confirmou a conta solicitada. Vínculo não salvo.");
  }
  await repositorio.inserir({ discordId, ...sessao });
  return perfil;
}

export async function desvincularConta(
  discordId: string,
  api: Pick<ClienteRone, "encerrarSessao">,
  repositorio: Pick<RepositorioVinculos, "buscar" | "remover">,
): Promise<{ removido: boolean; revogacao: "confirmada" | "nao_confirmada" | "nao_necessaria" }> {
  let vinculo;
  try { vinculo = await repositorio.buscar(discordId); } catch (erro) {
    if (!(erro instanceof ErroVinculo) || erro.codigo !== "credencial_invalida") throw erro;
    // Uma chave perdida ou credencial corrompida não pode impedir a remoção local.
    return { removido: await repositorio.remover(discordId), revogacao: "nao_confirmada" };
  }
  if (!vinculo) return { removido: false, revogacao: "nao_necessaria" };
  let revogacao: "confirmada" | "nao_confirmada" = "confirmada";
  try { await api.encerrarSessao(vinculo.jwt); } catch { revogacao = "nao_confirmada"; }
  const removido = await repositorio.remover(discordId);
  return { removido, revogacao };
}
