import { randomBytes } from "node:crypto";
import { ErroBooster } from "./types.ts";
import type { RepositorioBooster } from "./types.ts";
import type { Beneficio, DadosBeneficio, DiscordBeneficio, Etapa, ReferenciaAtendimento, RepositorioBeneficio } from "./benefit-types.ts";
import { validarHex, validarIcone, validarNome, validarPreferencias } from "./preferences.ts";

export function novoBeneficio(servidorId: string, usuarioId: string): Beneficio {
  return { servidorId, usuarioId, sessao: randomBytes(16).toString("hex"), revisao: 0, canalId: null,
    mensagemId: null, canalEstado: "novo", cargoId: null, cargoEstado: "nenhum", etapa: "nome",
    nome: "", estilo: "solida", corPrimaria: null, corSecundaria: null, icone: null };
}

export class AtendimentoBooster {
  readonly #repo: RepositorioBeneficio;
  readonly #config: Pick<RepositorioBooster, "buscar">;
  readonly #discord: DiscordBeneficio;
  constructor(repo: RepositorioBeneficio, config: Pick<RepositorioBooster, "buscar">, discord: DiscordBeneficio) {
    this.#repo = repo; this.#config = config; this.#discord = discord;
  }

  async abrir(servidorId: string, usuarioId: string): Promise<string> {
    return this.#repo.exclusivo(servidorId, usuarioId, async (db) => {
      if (!await this.#discord.elegivel(servidorId, usuarioId)) throw new ErroBooster("É necessário ter boost ativo neste servidor para iniciar o atendimento.");
      const config = await this.config(servidorId);
      let b = await db.buscar() ?? novoBeneficio(servidorId, usuarioId);
      if (b.canalId && !await this.#discord.canalExiste(b)) {
        // O Discord confirmou que o canal foi excluído. Mantém o cargo, proprietário,
        // estado e preferências; a criação seguinte continua sob o mesmo bloqueio.
        b.canalId = null;
        b.mensagemId = null;
        b.canalEstado = "novo";
        b.revisao++;
        await db.salvar(b);
      }
      if (b.canalEstado === "criando" && !b.canalId) {
        b.canalId = await this.#discord.recuperarCanal(config, b);
        if (!b.canalId) throw new ErroBooster("A criação anterior do canal não foi confirmada. A equipe precisa verificar a operação antes de outra tentativa; nenhum novo canal foi criado.");
        await db.salvar(b);
      }
      if (!b.canalId) {
        b.canalEstado = "criando";
        await db.salvar(b);
        try { b.canalId = await this.#discord.criarCanal(config, b); }
        catch (erro) {
          // ErroBooster aqui é validação local anterior ao POST, sem efeito externo.
          if (erro instanceof ErroBooster) { b.canalEstado = "novo"; await db.salvar(b); }
          throw erro;
        }
        await db.salvar(b);
      }
      if (b.canalEstado === "fechado" || b.etapa === "concluido" || b.etapa === "cancelado") {
        b = { ...b, sessao: randomBytes(16).toString("hex"), etapa: "nome", revisao: b.revisao + 1 };
      }
      await this.#discord.prepararCanal(config, b, false);
      b.canalEstado = "aberto";
      await db.salvar(b);
      await this.apresentar(db, b);
      return b.canalId!;
    });
  }

  async consultar(ref: ReferenciaAtendimento): Promise<Beneficio> {
    return this.#repo.exclusivo(ref.servidorId, ref.usuarioId, async (db) => this.autorizar(await db.buscar(), ref));
  }

  async alterar(ref: ReferenciaAtendimento, acao: string, dados: { nome?: string; primaria?: string; secundaria?: string; icone?: Buffer | null } = {}): Promise<void> {
    await this.#repo.exclusivo(ref.servidorId, ref.usuarioId, async (db) => {
      const b = this.autorizar(await db.buscar(), ref);
      const recursos = await this.#discord.recursos(b.servidorId);
      if (acao === "nome" && b.etapa === "nome") { b.nome = validarNome(dados.nome ?? ""); b.etapa = "estilo"; }
      else if (["solida", "gradiente"].includes(acao) && b.etapa === "estilo") {
        if (acao === "gradiente" && !recursos.gradiente) throw new ErroBooster("Gradientes indisponíveis neste servidor. Escolha cor sólida.");
        b.estilo = acao === "gradiente" ? "gradiente" : "solida";
        if (b.estilo === "solida") b.corSecundaria = null;
        b.etapa = "cores";
      } else if (acao === "cores" && b.etapa === "cores") {
        b.corPrimaria = validarHex(dados.primaria ?? "");
        b.corSecundaria = b.estilo === "gradiente" ? validarHex(dados.secundaria ?? "") : null;
        b.etapa = "icone";
      } else if (acao === "icone" && b.etapa === "icone") {
        if (dados.icone && !recursos.icone) throw new ErroBooster("Ícones indisponíveis. Continue sem ícone.");
        b.icone = dados.icone ? validarIcone(dados.icone) : null;
        b.etapa = "resumo";
      } else if (acao === "voltar" && !["concluido", "cancelado"].includes(b.etapa)) {
        const anteriores: Record<Etapa, Etapa> = { nome: "nome", estilo: "nome", cores: "estilo", icone: "cores", resumo: "icone", concluido: "nome", cancelado: "nome" };
        b.etapa = anteriores[b.etapa];
      } else if (acao === "cancelar" && !["concluido", "cancelado"].includes(b.etapa)) b.etapa = "cancelado";
      else if (acao === "fechar" && ["concluido", "cancelado"].includes(b.etapa)) {
        await this.#discord.apagarCanal(b);
        b.canalId = null;
        b.mensagemId = null;
        b.canalEstado = "fechado";
        b.revisao++;
        await db.salvar(b);
        // O canal não existe mais; não tente atualizar a mensagem do assistente.
        return;
      } else if (acao === "confirmar" && b.etapa === "resumo") {
        validarPreferencias(b, recursos);
        if (!await this.#discord.elegivel(b.servidorId, b.usuarioId)) throw new ErroBooster("Seu boost não está ativo. O cargo não foi aplicado.");
        const config = await this.config(b.servidorId);
        if (!b.cargoId) {
          if (b.cargoEstado === "criando") throw new ErroBooster("A criação anterior do cargo ficou sem confirmação. Não criarei outro. A equipe deve conferir o registro de auditoria e recuperar a referência no banco.");
          b.cargoEstado = "criando";
          await db.salvar(b);
          try { b.cargoId = await this.#discord.criarCargo(config, b); }
          catch (erro) {
            if (erro instanceof ErroBooster) { b.cargoEstado = "nenhum"; await db.salvar(b); }
            throw erro;
          }
          b.cargoEstado = "pendente";
          // Persistir o ID antes de editar/atribuir permite retomar sem criar outro.
          await db.salvar(b);
        }
        await this.#discord.aplicarCargo(config, b);
        b.cargoEstado = "ativo";
        b.etapa = "concluido";
      } else throw new ErroBooster("Esta ação não corresponde à etapa atual. Reabra seu atendimento pelo painel.");
      b.revisao++;
      await db.salvar(b);
      await this.apresentar(db, b);
    });
  }

  private autorizar(b: Beneficio | null, ref: ReferenciaAtendimento): Beneficio {
    if (!b || b.servidorId !== ref.servidorId || b.usuarioId !== ref.usuarioId || b.canalId !== ref.canalId
      || b.sessao !== ref.sessao || b.revisao !== ref.revisao || b.canalEstado !== "aberto") {
      throw new ErroBooster("Este controle não pertence ao seu atendimento atual ou já foi utilizado. Use a mensagem mais recente ou reabra pelo painel.");
    }
    return b;
  }

  private async config(servidorId: string) {
    const config = await this.#config.buscar(servidorId);
    if (!config) throw new ErroBooster("A equipe precisa configurar o benefício com /booster configurar.");
    return config;
  }

  private async apresentar(db: DadosBeneficio, b: Beneficio): Promise<void> {
    b.mensagemId = await this.#discord.apresentar(b, await this.#discord.recursos(b.servidorId));
    await db.salvar(b);
  }
}
