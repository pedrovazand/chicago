export type ContaJogo = {
  jogadorId: string;
  servidorId: string;
};

export type SessaoRone = ContaJogo & {
  jwt: string;
};

export type PerfilRone = ContaJogo & {
  nome: string | null;
  nivel: number | null;
  avatar: string | null;
};

export type HeroiRone = {
  nome: string;
  funcoes: string[];
  rotas: string[];
  imagem: string | null;
};

export type PartidaRone = {
  heroi: string | null;
  heroiId: string | null;
  resultado: "vitoria" | "derrota" | "nao_informado";
  abates: number | null;
  mortes: number | null;
  assistencias: number | null;
  ocorridaEm: number | null;
};

export type HistoricoRone = {
  temporada: number;
  partidas: PartidaRone[];
  temMais: boolean | null;
};

export type EstatisticasRone = {
  partidas: number | null;
  vitorias: number | null;
  winrate: number | null;
  notaMedia: number | null;
  mvps: number | null;
};

export type TipoErroRone =
  | "entrada_invalida"
  | "timeout"
  | "indisponivel"
  | "nao_autenticado"
  | "rejeitada"
  | "limite"
  | "nao_encontrado"
  | "resposta_invalida";

// Lista restrita de metadados; nunca inclui URL, headers, corpo ou mensagem externa.
export type DiagnosticoRone = {
  operacao: "temporadas" | "partidas" | "estatisticas";
  statusHttp: number;
  codigoApi: number;
};

export class ErroRone extends Error {
  readonly tipo: TipoErroRone;
  readonly diagnostico?: DiagnosticoRone;

  constructor(tipo: TipoErroRone, mensagem: string, diagnostico?: DiagnosticoRone) {
    super(mensagem);
    this.name = "ErroRone";
    this.tipo = tipo;
    this.diagnostico = diagnostico;
  }
}
