import type { ConfigBooster } from "./types.ts";

export type Etapa = "nome" | "estilo" | "cores" | "icone" | "resumo" | "concluido" | "cancelado";
export type Beneficio = {
  servidorId: string; usuarioId: string; sessao: string; revisao: number;
  canalId: string | null; mensagemId: string | null;
  canalEstado: "novo" | "criando" | "aberto" | "fechado";
  cargoId: string | null; cargoEstado: "nenhum" | "criando" | "pendente" | "ativo";
  etapa: Etapa; nome: string; estilo: "solida" | "gradiente";
  corPrimaria: string | null; corSecundaria: string | null; icone: Buffer | null;
};
export type RecursosCargo = { gradiente: boolean; icone: boolean };
export type ReferenciaAtendimento = { servidorId: string; usuarioId: string; canalId: string; sessao: string; revisao: number };
export interface DadosBeneficio {
  buscar(): Promise<Beneficio | null>;
  salvar(beneficio: Beneficio): Promise<void>;
}
export interface RepositorioBeneficio {
  exclusivo<T>(servidorId: string, usuarioId: string, tarefa: (db: DadosBeneficio) => Promise<T>): Promise<T>;
}
export interface DiscordBeneficio {
  elegivel(servidorId: string, usuarioId: string): Promise<boolean>;
  recursos(servidorId: string): Promise<RecursosCargo>;
  canalExiste(beneficio: Beneficio): Promise<boolean>;
  apagarCanal(beneficio: Beneficio): Promise<void>;
  criarCanal(config: ConfigBooster, beneficio: Beneficio): Promise<string>;
  recuperarCanal(config: ConfigBooster, beneficio: Beneficio): Promise<string | null>;
  prepararCanal(config: ConfigBooster, beneficio: Beneficio, fechado: boolean): Promise<void>;
  apresentar(beneficio: Beneficio, recursos: RecursosCargo): Promise<string>;
  criarCargo(config: ConfigBooster, beneficio: Beneficio): Promise<string>;
  aplicarCargo(config: ConfigBooster, beneficio: Beneficio): Promise<void>;
}
