import { readFile } from "node:fs/promises";
import { ErroBooster } from "./types.ts";

export const limiteImagemPainel = 5 * 1024 * 1024;
export type AnexoImagem = { url: string; size: number; contentType: string | null };
export type ImagemPainel = { dados: Buffer; nome: string; tipo: string };

export function validarImagemPainel(dados: Buffer): ImagemPainel {
  if (!dados.length || dados.length > limiteImagemPainel) throw new ErroBooster("A imagem deve ter no máximo 5 MiB e não pode estar vazia.");
  // Verifica o formato pelo conteúdo, sem confiar na extensão ou no MIME informado.
  if (dados.length >= 24 && dados.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && dados.toString("ascii", 12, 16) === "IHDR" && dados.readUInt32BE(16) > 0 && dados.readUInt32BE(20) > 0) {
    return { dados, nome: "booster-panel.png", tipo: "image/png" };
  }
  if (dados.length >= 4 && dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff
    && dados.at(-2) === 0xff && dados.at(-1) === 0xd9) return { dados, nome: "booster-panel.jpg", tipo: "image/jpeg" };
  if (dados.length >= 13 && ["GIF87a", "GIF89a"].includes(dados.toString("ascii", 0, 6))) {
    return { dados, nome: "booster-panel.gif", tipo: "image/gif" };
  }
  if (dados.length >= 16 && dados.toString("ascii", 0, 4) === "RIFF" && dados.toString("ascii", 8, 12) === "WEBP") {
    return { dados, nome: "booster-panel.webp", tipo: "image/webp" };
  }
  throw new ErroBooster("Formato de imagem inválido. Envie PNG, JPEG, GIF ou WebP; SVG e outros arquivos não são aceitos.");
}

export async function lerImagemPainel(dados: Buffer | null = null): Promise<ImagemPainel> {
  return validarImagemPainel(dados ?? await readFile(new URL("../../assets/booster-panel.png", import.meta.url)));
}

export async function baixarImagemPainel(anexo: AnexoImagem, requisitar: typeof fetch = fetch): Promise<Buffer> {
  if (!Number.isSafeInteger(anexo.size) || anexo.size <= 0 || anexo.size > limiteImagemPainel) {
    throw new ErroBooster("Envie uma imagem de até 5 MiB.");
  }
  const url = new URL(anexo.url);
  if (url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
    || !/^\/(?:ephemeral-)?attachments\//.test(url.pathname) || url.username || url.password || url.port) {
    throw new ErroBooster("Use um arquivo anexado diretamente à opção arquivo do comando.");
  }
  if (anexo.contentType && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(anexo.contentType)) {
    throw new ErroBooster("Envie PNG, JPEG, GIF ou WebP.");
  }
  try {
    const resposta = await requisitar(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!resposta.ok || !resposta.body) throw new ErroBooster("Não foi possível baixar a imagem. Anexe o arquivo novamente e tente outra vez.");
    const leitor = resposta.body.getReader();
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        tamanho += value.length;
        if (tamanho > limiteImagemPainel) {
          await leitor.cancel();
          throw new ErroBooster("A imagem excede 5 MiB.");
        }
        partes.push(value);
      }
    } finally { leitor.releaseLock(); }
    const imagem = validarImagemPainel(Buffer.concat(partes));
    if (anexo.contentType && imagem.tipo !== anexo.contentType) throw new ErroBooster("O conteúdo do arquivo não corresponde ao tipo de imagem informado.");
    return imagem.dados;
  } catch (erro) {
    if (erro instanceof ErroBooster) throw erro;
    throw new ErroBooster("O download da imagem falhou ou demorou demais. Anexe o arquivo novamente e tente outra vez.");
  }
}
