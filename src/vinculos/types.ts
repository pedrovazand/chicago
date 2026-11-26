import type { ContaJogo, SessaoRone } from "../rone/types.ts";

export type IdentidadeVinculo = ContaJogo & { discordId: string };
export type Vinculo = SessaoRone & { discordId: string };

export type CodigoErroVinculo =
  | "configuracao"
  | "entrada_invalida"
  | "discord_ja_vinculado"
  | "conta_ja_vinculada"
  | "conta_divergente"
  | "credencial_invalida"
  | "banco_indisponivel";

export class ErroVinculo extends Error {
  readonly codigo: CodigoErroVinculo;

  constructor(codigo: CodigoErroVinculo, mensagem: string) {
    super(mensagem);
    this.name = "ErroVinculo";
    this.codigo = codigo;
  }
}

export function validarDiscordId(discordId: string): void {
  if (!/^[1-9]\d{0,19}$/.test(discordId)) {
    throw new ErroVinculo("entrada_invalida", "ID do Discord inválido; mantenha-o como texto.");
  }
}

export function validarIdentidade(identidade: IdentidadeVinculo): void {
  validarDiscordId(identidade.discordId);
  for (const id of [identidade.jogadorId, identidade.servidorId]) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new ErroVinculo("entrada_invalida", "IDs do jogo inválidos.");
    }
  }
}
