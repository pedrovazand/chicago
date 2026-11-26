import { ErroBooster } from "./types.ts";
import type { EntradaConfigBooster, RepositorioBooster } from "./types.ts";
import { validarImagemPainel } from "./image.ts";

export interface PublicadorPainel {
  existe(canalId: string, mensagemId: string): Promise<boolean>;
  recuperar(canalId: string): Promise<string | null>;
  enviar(canalId: string, imagem?: Buffer | null): Promise<string>;
  atualizar(canalId: string, mensagemId: string, imagem?: Buffer | null): Promise<void>;
  fixar(canalId: string, mensagemId: string): Promise<void>;
}

export async function publicarPainel(repo: RepositorioBooster, discord: PublicadorPainel, entrada: EntradaConfigBooster): Promise<void> {
  await repo.exclusivo(entrada.servidorId, async (db) => {
    const anterior = await db.buscar(entrada.servidorId);
    if (anterior && anterior.canalPainelId !== entrada.canalPainelId) {
      // Evita deixar dois painéis operantes em canais diferentes.
      if (anterior.painelPendente || (anterior.mensagemPainelId && await discord.existe(anterior.canalPainelId, anterior.mensagemPainelId))) {
        throw new ErroBooster("Já existe um painel em outro canal. Atualize usando o canal original; para mover, remova primeiro a mensagem antiga. Se a publicação estiver pendente, recupere-a no canal original.");
      }
    }
    const mesmoCanal = anterior?.canalPainelId === entrada.canalPainelId;
    let mensagemId = mesmoCanal ? anterior.mensagemPainelId : null;
    if (mensagemId && !await discord.existe(entrada.canalPainelId, mensagemId)) mensagemId = null;
    if (mesmoCanal && anterior.painelPendente) {
      mensagemId = await discord.recuperar(entrada.canalPainelId);
      if (!mensagemId) throw new ErroBooster("A publicação anterior ficou sem confirmação. Não criarei outro painel. Confira as últimas 100 mensagens do canal e as permissões do bot; tente novamente após restaurar o acesso. Se a mensagem não puder ser localizada, será necessária recuperação administrativa no banco.");
    }
    const config = { ...entrada, mensagemPainelId: mensagemId, painelPendente: mensagemId === null, imagemPainel: anterior?.imagemPainel ?? null };
    await db.salvar(config);
    if (!mensagemId) {
      mensagemId = await discord.enviar(entrada.canalPainelId, config.imagemPainel);
      // Salva antes de fixar: erro de permissão para fixar não duplica mensagens.
      await db.salvar({ ...config, mensagemPainelId: mensagemId, painelPendente: false });
    } else {
      await discord.atualizar(entrada.canalPainelId, mensagemId, config.imagemPainel);
    }
    await discord.fixar(entrada.canalPainelId, mensagemId);
  });
}

export async function trocarImagemPainel(repo: RepositorioBooster, discord: PublicadorPainel, servidorId: string, imagem: Buffer | null): Promise<void> {
  if (imagem) validarImagemPainel(imagem);
  await repo.exclusivo(servidorId, async (db) => {
    const config = await db.buscar(servidorId);
    if (!config?.mensagemPainelId || config.painelPendente) throw new ErroBooster("Publique ou recupere o painel com /booster configurar antes de trocar a imagem.");
    if (!await discord.existe(config.canalPainelId, config.mensagemPainelId)) throw new ErroBooster("A mensagem do painel foi excluída. Publique o painel novamente com /booster configurar.");
    await db.salvar({ ...config, imagemPainel: imagem });
    try { await discord.atualizar(config.canalPainelId, config.mensagemPainelId, imagem); }
    catch { throw new ErroBooster("A imagem foi salva, mas a atualização do Discord não foi confirmada. Confira as permissões e repita /booster configurar para reaplicar a imagem salva."); }
  });
}
