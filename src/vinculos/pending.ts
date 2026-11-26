import { randomBytes } from "node:crypto";
import type { ContaJogo } from "../rone/types.ts";
import { validarIdentidade } from "./types.ts";

type Tentativa = {
  id: string;
  discordId: string;
  guildId: string;
  conta: ContaJogo;
  expiraEm: number;
  estado: "enviando" | "aguardando" | "processando";
};

export class ErroTentativa extends Error {
  constructor(mensagem: string) { super(mensagem); this.name = "ErroTentativa"; }
}

export class TentativasVinculo {
  readonly #tentativas = new Map<string, Tentativa>();
  readonly #agora: () => number;

  constructor(agora: () => number = Date.now) { this.#agora = agora; }

  private limparExpiradas(): void {
    for (const [id, tentativa] of this.#tentativas) {
      if (tentativa.estado !== "processando" && tentativa.expiraEm <= this.#agora()) this.#tentativas.delete(id);
    }
  }

  iniciar(discordId: string, guildId: string, conta: ContaJogo): string {
    validarIdentidade({ discordId, ...conta });
    this.limparExpiradas();
    for (const tentativa of this.#tentativas.values()) {
      if (tentativa.discordId === discordId) throw new ErroTentativa("Você já tem um vínculo em andamento. Use o botão anterior, aguarde expirar ou cancele com /desvincular.");
      if (tentativa.conta.jogadorId === conta.jogadorId && tentativa.conta.servidorId === conta.servidorId) {
        throw new ErroTentativa("Já existe uma tentativa em andamento para essa conta. Aguarde antes de iniciar outra.");
      }
    }
    const id = randomBytes(16).toString("hex");
    this.#tentativas.set(id, { id, discordId, guildId, conta: { ...conta }, expiraEm: this.#agora() + 5 * 60_000, estado: "enviando" });
    return id;
  }

  confirmarEnvio(id: string): void {
    const tentativa = this.#tentativas.get(id);
    if (!tentativa || tentativa.estado !== "enviando") throw new ErroTentativa("Tentativa indisponível. Inicie /vincular novamente.");
    tentativa.estado = "aguardando";
  }

  consultar(id: string, discordId: string, guildId: string): ContaJogo {
    this.limparExpiradas();
    const tentativa = this.#tentativas.get(id);
    if (!tentativa || tentativa.discordId !== discordId || tentativa.guildId !== guildId || tentativa.estado !== "aguardando") {
      throw new ErroTentativa("Tentativa expirada, já utilizada ou indisponível para este usuário. Inicie /vincular novamente se necessário.");
    }
    return { ...tentativa.conta };
  }

  consumir(id: string, discordId: string, guildId: string): ContaJogo {
    const conta = this.consultar(id, discordId, guildId);
    this.#tentativas.get(id)!.estado = "processando";
    return conta;
  }

  finalizar(id: string): void { this.#tentativas.delete(id); }

  cancelar(discordId: string): boolean {
    this.limparExpiradas();
    for (const [id, tentativa] of this.#tentativas) {
      if (tentativa.discordId === discordId) {
        if (tentativa.estado === "processando") throw new ErroTentativa("Aguarde a confirmação do vínculo antes de desvincular.");
        this.#tentativas.delete(id);
        return true;
      }
    }
    return false;
  }
}
