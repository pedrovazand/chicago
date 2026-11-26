import type { Role } from "discord.js";
import { ErroBooster } from "./types.ts";

export function validarReferenciaCargo(guildId: string, bot: Role, equipe: Role, referencia: Role): void {
  // Equipe é o limite escolhido pela administração. Permissões em cargos de
  // outros bots não os tornam automaticamente cargos protegidos da equipe.
  if (referencia.id === guildId || equipe.id === guildId || referencia.comparePositionTo(bot) >= 0
    || referencia.comparePositionTo(equipe) > 0) {
    throw new ErroBooster("A referência pode ser o próprio cargo Equipe, mas precisa ficar abaixo do maior cargo do bot e não pode ficar acima de Equipe. Mantenha os demais cargos protegidos da equipe acima desse limite.");
  }
}

export function posicaoAbaixoDaReferencia(cargo: Pick<Role, "id" | "position">, referencia: Pick<Role, "id" | "position">): number {
  if (cargo.id === referencia.id) throw new ErroBooster("O cargo personalizado não pode ser usado como sua própria referência.");
  // Ao remover um cargo que estava abaixo da referência, o índice dela diminui.
  // Se ele estava acima, inserir no índice atual da referência o coloca logo abaixo.
  return Math.max(1, referencia.position - (cargo.position < referencia.position ? 1 : 0));
}
