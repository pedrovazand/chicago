export type ConfigBooster = {
  servidorId: string;
  canalPainelId: string;
  categoriaId: string;
  equipeId: string;
  referenciaId: string;
  mensagemPainelId: string | null;
  painelPendente: boolean;
  imagemPainel: Buffer | null;
};

export type EntradaConfigBooster = Omit<ConfigBooster, "mensagemPainelId" | "painelPendente" | "imagemPainel">;

export class ErroBooster extends Error {}

export interface ArmazenamentoBooster {
  buscar(servidorId: string): Promise<ConfigBooster | null>;
  salvar(config: ConfigBooster): Promise<void>;
}

export interface RepositorioBooster extends Pick<ArmazenamentoBooster, "buscar"> {
  exclusivo<T>(servidorId: string, tarefa: (db: ArmazenamentoBooster) => Promise<T>): Promise<T>;
}
