import { carregarConfig } from "./config.ts";

try {
  carregarConfig();
  console.log("Configuração carregada: as três variáveis estão preenchidas.");
  console.log("Esta verificação é local; as credenciais ainda não foram validadas pelo Discord.");
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : "Falha ao carregar a configuração.");
  process.exitCode = 1;
}
