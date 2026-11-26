import { ClienteRone } from "./rone/client.ts";
import { ErroRone } from "./rone/types.ts";

// Esta entrada executa somente uma consulta pública. Não faz autenticação.
try {
  const cliente = new ClienteRone();
  const heroi = await cliente.consultarHeroi(process.argv[2] ?? "Miya");
  console.log(heroi);
} catch (erro) {
  console.error(erro instanceof ErroRone ? `${erro.tipo}: ${erro.message}` : "Falha inesperada na consulta pública.");
  process.exitCode = 1;
}
