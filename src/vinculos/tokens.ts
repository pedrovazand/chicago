import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ErroVinculo } from "./types.ts";
import type { IdentidadeVinculo } from "./types.ts";

export class ProtecaoTokens {
  // Campo privado de JavaScript: a chave não aparece ao inspecionar a instância.
  readonly #chave: Buffer;

  constructor(chaveHex = process.env.RONE_TOKEN_ENCRYPTION_KEY) {
    if (!chaveHex || !/^[a-fA-F0-9]{64}$/.test(chaveHex)) {
      throw new ErroVinculo("configuracao", "Defina RONE_TOKEN_ENCRYPTION_KEY com 32 bytes em hexadecimal.");
    }
    this.#chave = Buffer.from(chaveHex, "hex");
  }

  private contexto(identidade: IdentidadeVinculo): Buffer {
    return Buffer.from(JSON.stringify(["v1", identidade.discordId, identidade.jogadorId, identidade.servidorId]));
  }

  cifrar(jwt: string, identidade: IdentidadeVinculo): string {
    if (!jwt.trim() || jwt.length > 16_384) {
      throw new ErroVinculo("credencial_invalida", "Credencial ausente ou inválida.");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#chave, iv, { authTagLength: 16 });
    cipher.setAAD(this.contexto(identidade));
    const cifrado = Buffer.concat([cipher.update(jwt, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
  }

  decifrar(valor: string, identidade: IdentidadeVinculo): string {
    try {
      const partes = valor.split(".");
      if (partes.length !== 4 || partes[0] !== "v1") throw new Error();
      const campos = partes.slice(1).map((campo) => {
        if (!/^[A-Za-z0-9_-]+$/.test(campo)) throw new Error();
        const buffer = Buffer.from(campo, "base64url");
        if (buffer.toString("base64url") !== campo) throw new Error();
        return buffer;
      });
      const [iv, tag, cifrado] = campos;
      if (iv.length !== 12 || tag.length !== 16 || cifrado.length === 0) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", this.#chave, iv, { authTagLength: 16 });
      decipher.setAAD(this.contexto(identidade));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
    } catch {
      throw new ErroVinculo("credencial_invalida", "Não foi possível autenticar a credencial armazenada. Confira a chave ou refaça o vínculo.");
    }
  }
}
