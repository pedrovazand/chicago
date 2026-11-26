import { ErroRone } from "./types.ts";
import type { ContaJogo, DiagnosticoRone, EstatisticasRone, HeroiRone, HistoricoRone, PartidaRone, PerfilRone, SessaoRone } from "./types.ts";

function objeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new ErroRone("resposta_invalida", "A API retornou dados vazios ou com formato inesperado.");
  }
  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new ErroRone("resposta_invalida", "A API não retornou um campo de texto obrigatório.");
  }
  return valor;
}

function idExterno(valor: unknown): string {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new ErroRone("resposta_invalida", "A API retornou um identificador inválido.");
  }
  return String(valor);
}

function idParaApi(valor: string): number {
  if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(Number(valor))) {
    throw new ErroRone("entrada_invalida", "Os IDs do jogo devem ser inteiros positivos dentro do limite seguro.");
  }
  return Number(valor);
}

function urlImagem(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const endereco = texto(valor);
  try {
    const url = new URL(endereco);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* URL externa inválida. */ }
  throw new ErroRone("resposta_invalida", "A API retornou uma URL de imagem inválida.");
}

function listaTextos(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || !valor.every((item) => typeof item === "string")) {
    throw new ErroRone("resposta_invalida", "A API retornou uma lista com formato inesperado.");
  }
  return valor.map((item: string) => item.trim()).filter(Boolean);
}

function inteiroOpcional(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
    throw new ErroRone("resposta_invalida", "A API retornou uma contagem ou identificador inválido.");
  }
  return valor;
}

function lerPartida(valor: unknown, temporada: number): PartidaRone {
  const partida = objeto(valor);
  if (partida.sid != null && inteiroOpcional(partida.sid) !== temporada) {
    throw new ErroRone("resposta_invalida", "A API retornou uma partida de outra temporada.");
  }
  const resultado = inteiroOpcional(partida.res);
  if (resultado !== null && resultado !== 0 && resultado !== 1) {
    throw new ErroRone("resposta_invalida", "A API retornou um resultado de partida não reconhecido.");
  }
  const entidade = partida.hid_e == null ? null : objeto(partida.hid_e);
  const heroi = entidade?.n == null || entidade.n === "" ? null : texto(entidade.n);
  const heroiId = partida.hid == null ? null : idExterno(partida.hid);
  const ocorridaEm = inteiroOpcional(partida.ts);
  if (ocorridaEm !== null && !Number.isFinite(new Date(ocorridaEm * 1000).getTime())) {
    throw new ErroRone("resposta_invalida", "A API retornou uma data de partida inválida.");
  }
  return {
    heroi, heroiId, resultado: resultado === null ? "nao_informado" : resultado === 1 ? "vitoria" : "derrota",
    abates: inteiroOpcional(partida.k), mortes: inteiroOpcional(partida.d),
    assistencias: inteiroOpcional(partida.a), ocorridaEm,
  };
}

type OpcoesCliente = {
  baseUrl?: string;
  timeoutMs?: number;
  // Nos testes, substituímos somente o transporte, sem acessar a rede.
  transporte?: typeof fetch;
};

export class ClienteRone {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transporte: typeof fetch;

  constructor(opcoes: OpcoesCliente = {}) {
    const base = opcoes.baseUrl ?? process.env.RONE_API_BASE_URL ?? "https://arena.fastapicloud.dev/api";
    let url: URL;
    try { url = new URL(base); } catch {
      throw new ErroRone("entrada_invalida", "RONE_API_BASE_URL não é uma URL válida.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/api") {
      throw new ErroRone("entrada_invalida", "Use uma base HTTPS terminada em /api, sem credenciais ou parâmetros.");
    }
    this.baseUrl = url.href.replace(/\/$/, "");
    this.timeoutMs = opcoes.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new ErroRone("entrada_invalida", "O timeout deve ser um inteiro positivo em milissegundos.");
    }
    this.transporte = opcoes.transporte ?? fetch;
  }

  private async requisitar(caminho: string, metodo: "GET" | "POST", corpo?: object, jwt?: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "ChicagoDiscordBot/0.1 (+https://github.com/pedrovazand/chicago)",
    };
    if (corpo) headers["Content-Type"] = "application/json";
    if (jwt !== undefined) {
      if (!jwt.trim() || /[\r\n]/.test(jwt)) throw new ErroRone("entrada_invalida", "Sessão ausente ou inválida.");
      headers.Authorization = `Bearer ${jwt}`;
    }

    try {
      // Uma tentativa apenas. Redirecionamentos não podem encaminhar credenciais.
      const resposta = await this.transporte(`${this.baseUrl}${caminho}`, {
        method: metodo, headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (resposta.status === 401) throw new ErroRone("nao_autenticado", "A API não aceitou a autenticação da sessão.");
      if (resposta.status === 429) throw new ErroRone("limite", "A API limitou as requisições. Aguarde antes de tentar novamente.");
      if (resposta.status === 404) throw new ErroRone("nao_encontrado", "O recurso solicitado não foi encontrado.");
      if (resposta.status === 400 || resposta.status === 422) throw new ErroRone("rejeitada", "A API recusou os dados da solicitação.");
      if (!resposta.ok) throw new ErroRone("indisponivel", "A API está indisponível ou bloqueou o acesso.");
      if (!resposta.headers.get("content-type")?.includes("application/json")) {
        throw new ErroRone("resposta_invalida", "A API respondeu em um formato diferente de JSON.");
      }
      const dados: unknown = await resposta.json();
      const envelope = objeto(dados);
      if (typeof envelope.code !== "number" || !Number.isSafeInteger(envelope.code)) {
        throw new ErroRone("resposta_invalida", "A API não retornou um código de resultado válido.");
      }
      if (envelope.code !== 0) {
        const rota = caminho.split("?")[0];
        const operacao = rota === "/user/season" ? "temporadas"
          : rota === "/user/matches" ? "partidas"
          : rota === "/user/stats" ? "estatisticas" : null;
        const diagnostico: DiagnosticoRone | undefined = operacao === null ? undefined : {
          operacao, statusHttp: resposta.status, codigoApi: envelope.code,
        };
        throw new ErroRone("rejeitada", "A API recusou a operação; ela não foi confirmada.", diagnostico);
      }
      return envelope.data;
    } catch (erro) {
      if (erro instanceof ErroRone) throw erro;
      if (erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError")) {
        throw new ErroRone("timeout", "A API demorou para responder. A operação pode ter sido recebida; não foi repetida.");
      }
      if (erro instanceof SyntaxError) throw new ErroRone("resposta_invalida", "A API retornou JSON inválido.");
      // Não propagamos corpos, headers, mensagens externas ou causas com segredos.
      throw new ErroRone("indisponivel", "Não foi possível concluir a comunicação com a API; a operação não foi repetida.");
    }
  }

  async solicitarCodigo(conta: ContaJogo): Promise<void> {
    await this.requisitar("/user/auth/send-vc", "POST", {
      role_id: idParaApi(conta.jogadorId), zone_id: idParaApi(conta.servidorId),
    });
  }

  async autenticar(conta: ContaJogo, codigo: string): Promise<SessaoRone> {
    if (!/^\d{4}$/.test(codigo)) throw new ErroRone("entrada_invalida", "O código deve conter quatro dígitos.");
    const dados = objeto(await this.requisitar("/user/auth/login", "POST", {
      role_id: idParaApi(conta.jogadorId), zone_id: idParaApi(conta.servidorId), vc: Number(codigo),
    }));
    const sessao = { jwt: texto(dados.jwt), jogadorId: idExterno(dados.roleid), servidorId: idExterno(dados.zoneid) };
    if (sessao.jogadorId !== conta.jogadorId || sessao.servidorId !== conta.servidorId) {
      throw new ErroRone("resposta_invalida", "A conta retornada pelo login difere da conta solicitada.");
    }
    return sessao;
  }

  async consultarPerfil(jwt: string): Promise<PerfilRone> {
    const dados = objeto(await this.requisitar("/user/info?lang=pt", "GET", undefined, jwt));
    const nivel = dados.level ?? null;
    if (nivel !== null && (typeof nivel !== "number" || !Number.isSafeInteger(nivel) || nivel < 0)) {
      throw new ErroRone("resposta_invalida", "A API retornou um nível de jogador inválido.");
    }
    return {
      jogadorId: idExterno(dados.roleId), servidorId: idExterno(dados.zoneId),
      nome: dados.name == null || dados.name === "" ? null : texto(dados.name),
      nivel,
      avatar: urlImagem(dados.avatar),
    };
  }

  async encerrarSessao(jwt: string): Promise<void> {
    await this.requisitar("/user/auth/logout", "POST", undefined, jwt);
  }

  /** @deprecated Referência; endpoint descontinuado, sem uso nos comandos ativos. */
  async consultarTemporadas(jwt: string): Promise<number[]> {
    const dados = objeto(await this.requisitar("/user/season?lang=pt", "GET", undefined, jwt));
    if (!Array.isArray(dados.sids)) throw new ErroRone("resposta_invalida", "A API não retornou a lista de temporadas.");
    const temporadas = dados.sids.map((id) => {
      const temporada = inteiroOpcional(id);
      if (temporada === null) throw new ErroRone("resposta_invalida", "A API retornou uma temporada vazia.");
      return temporada;
    });
    // O maior ID é a escolha padrão, sem presumir a temporada atual do calendário.
    return [...new Set(temporadas)].sort((a, b) => b - a);
  }

  /** @deprecated Referência; endpoint descontinuado, sem uso nos comandos ativos. */
  async consultarEstatisticas(jwt: string): Promise<EstatisticasRone> {
    const dados = objeto(await this.requisitar("/user/stats?lang=pt", "GET", undefined, jwt));
    const partidas = inteiroOpcional(dados.tc);
    const vitorias = inteiroOpcional(dados.wc);
    const mvps = inteiroOpcional(dados.mvpc);
    const notaBruta = dados.as ?? null;
    if (notaBruta !== null && (typeof notaBruta !== "number" || !Number.isFinite(notaBruta) || notaBruta < 0)) {
      throw new ErroRone("resposta_invalida", "A API retornou uma média de nota inválida.");
    }
    if (partidas === null && vitorias === null && mvps === null && notaBruta === null) {
      throw new ErroRone("resposta_invalida", "A API não retornou as estatísticas utilizadas pelo comando.");
    }
    if (partidas !== null && vitorias !== null && vitorias > partidas) {
      throw new ErroRone("resposta_invalida", "A API retornou mais vitórias que partidas; a taxa não pode ser confirmada.");
    }
    return {
      partidas, vitorias, mvps,
      winrate: partidas !== null && partidas > 0 && vitorias !== null ? (vitorias / partidas) * 100 : null,
      // O contrato documenta o campo 'as' na escala nota × 100.
      notaMedia: notaBruta === null ? null : notaBruta / 100,
    };
  }

  /** @deprecated Referência; endpoint descontinuado, sem uso nos comandos ativos. */
  async consultarHistorico(jwt: string, temporada: number, limite = 5): Promise<HistoricoRone> {
    if (!Number.isSafeInteger(temporada) || temporada < 0 || !Number.isInteger(limite) || limite < 1 || limite > 10) {
      throw new ErroRone("entrada_invalida", "Informe uma temporada válida e quantidade entre 1 e 10.");
    }
    const parametros = new URLSearchParams({ sid: String(temporada), limit: String(limite), lang: "pt" });
    const dados = objeto(await this.requisitar(`/user/matches?${parametros}`, "GET", undefined, jwt));
    if (!Array.isArray(dados.result)) throw new ErroRone("resposta_invalida", "A API não retornou a lista de partidas.");
    const pagina = dados.pageInfo == null ? null : objeto(dados.pageInfo);
    const hasNext = pagina?.hasNext ?? null;
    if (hasNext !== null && typeof hasNext !== "boolean") throw new ErroRone("resposta_invalida", "A API retornou paginação inválida.");
    return {
      temporada,
      partidas: dados.result.slice(0, limite).map((valor) => lerPartida(valor, temporada)),
      temMais: dados.result.length > limite ? true : hasNext,
    };
  }

  async consultarHeroi(nome: string): Promise<HeroiRone> {
    if (!nome.trim() || nome.length > 100) throw new ErroRone("entrada_invalida", "Informe um nome de herói com até 100 caracteres.");
    const dados = objeto(await this.requisitar(`/heroes/${encodeURIComponent(nome.trim())}?lang=pt&size=1`, "GET"));
    if (!Array.isArray(dados.records)) throw new ErroRone("resposta_invalida", "A API não retornou a lista de heróis.");
    if (dados.records.length === 0) throw new ErroRone("nao_encontrado", "Nenhum herói foi encontrado.");
    const registro = objeto(dados.records[0]);
    const dadosRegistro = objeto(registro.data);
    const hero = objeto(dadosRegistro.hero);
    const ficha = objeto(hero.data);
    return {
      nome: texto(ficha.name), funcoes: listaTextos(ficha.sortlabel),
      rotas: listaTextos(ficha.roadsortlabel), imagem: urlImagem(ficha.head),
    };
  }
}
