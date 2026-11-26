import { ErroBooster } from "./types.ts";
import type { Beneficio, RecursosCargo } from "./benefit-types.ts";
import { validarImagemPainel } from "./image.ts";

export function validarNome(nome: string): string {
  const limpo = nome.trim();
  if (!limpo || [...limpo].length > 100 || /[\u0000-\u001f\u007f]/u.test(limpo)) throw new ErroBooster("Informe um nome de 1 a 100 caracteres, sem quebras de linha ou controles.");
  return limpo;
}
export function validarHex(cor: string): string {
  if (!/^#[a-f0-9]{6}$/i.test(cor.trim())) throw new ErroBooster("Informe HEX com seis dígitos, por exemplo #AD75FF.");
  return cor.trim().toUpperCase();
}
export function validarIcone(dados: Buffer): Buffer {
  const imagem = validarImagemPainel(dados);
  if (!["image/png", "image/jpeg", "image/webp"].includes(imagem.tipo) || dados.length > 256 * 1024) {
    throw new ErroBooster("Envie um ícone PNG, JPEG ou WebP de até 256 KiB. Não é necessário redimensionar para 64×64. Você também pode continuar sem ícone.");
  }
  return dados;
}
export function validarPreferencias(b: Beneficio, recursos: RecursosCargo): void {
  validarNome(b.nome);
  validarHex(b.corPrimaria ?? "");
  if (b.estilo === "gradiente") {
    if (!recursos.gradiente) throw new ErroBooster("O servidor não oferece mais gradientes. Volte e selecione cor sólida.");
    validarHex(b.corSecundaria ?? "");
  }
  if (b.icone) {
    if (!recursos.icone) throw new ErroBooster("O servidor não oferece mais ícones. Volte e continue sem ícone.");
    validarIcone(b.icone);
  }
}
