# Integração Rone Arena

Desenvolvimento suspenso em favor do [autoatendimento de boosters](./boosters.md).
Código, vínculos e funcionalidades existentes permanecem preservados.

## Estado atual: fase encerrada

Por decisão do projeto em 2026-11-26, `/historico` e `/estatisticas` foram
descontinuados. As consultas dependiam de endpoints depreciados; o histórico
falhou na consulta de temporadas (HTTP 200, code 10407), mesmo com `/perfil`
funcionando. As estatísticas não tiveram funcionamento real confirmado.
Não haverá novas implementações dessas consultas nesta fase.

Continuam disponíveis `/ping`, `/vincular`, `/perfil`, `/desvincular` e `/heroi`.
Os vínculos e tokens cifrados existentes permanecem no PostgreSQL. Este encerramento
não executa migration, exclusão de vínculos nem logout.

O [registro](../src/register-commands.ts) remove somente os dois comandos antigos
do servidor de testes. Interações antigas em cache recebem uma resposta privada
de descontinuação, sem consultar a API ou acessar os vínculos. Os métodos antigos
do [cliente HTTP](../src/rone/client.ts) e seus testes permanecem como referência,
marcados com `@deprecated`, sem uso pelos comandos ativos.

Para aplicar e conferir:

```sh
npm run check
npm test
npm run build
npm run commands:register
```

Reinicie o processo do bot com `npm start` após parar a instância anterior.
No Discord, confirme que os dois comandos saíram da lista e use `/perfil` para
verificar seu vínculo. Se a lista ainda estiver em cache, reabra o Discord.
Os testes automatizados simulam serviços e verificam a preservação do vínculo;
o perfil autenticado real depende dessa verificação manual.

As seções abaixo registram as entregas anteriores; orientações sobre comandos
agora descontinuados são históricas.

Inspeção em 2026-11-25, OpenAPI 1.7.6. Cliente HTTP, persistência e comandos de vínculo
estão implementados. Você confirmou o vínculo real no Discord em 2026-11-26.

## Contratos consultados

Todos os caminhos abaixo são relativos à base `/api`.

| Endpoint | Entrada e autenticação | Sucesso documentado |
| --- | --- | --- |
| POST /user/auth/send-vc | JSON: role_id e zone_id inteiros; sem Bearer | code 0, msg, data vazia; código vale 5 minutos |
| POST /user/auth/login | JSON: role_id, zone_id e vc inteiros; sem Bearer | code 0; data.jwt, token, roleid, zoneid e time |
| GET /user/info | Authorization: Bearer JWT; lang opcional | code 0; data com name, avatar, roleId, zoneId, level e outros campos opcionais |
| POST /user/auth/logout | Authorization: Bearer JWT; sem corpo obrigatório | code 0, msg e data vazia; revogação documentada |
| GET /heroes/{hero_identifier} | ID ou nome; lang opcional; público | code 0; data.records com nome, imagem, função e rota |

Os quatro endpoints de autenticação/perfil não estão marcados com `deprecated: true`.
Estatísticas, partidas e outros endpoints de usuário estão marcados e ficam fora do escopo.
Os schemas de sucesso são permissivos: data pode estar vazio e campos podem faltar.
HTTP 200 sozinho não comprova sucesso; o cliente precisará validar code e os campos utilizados.
O código de verificação é documentado como inteiro de quatro dígitos. O campo de entrada
no Discord deve ser texto, validado antes da conversão para o contrato externo.

Perfil e logout documentam somente o JWT, portanto não há necessidade documentada de
persistir o outro token retornado pelo login. Não encontramos contrato de renovação ou
prazo fixo de sessão para este fluxo. Uma sessão inválida exigirá novo vínculo.

## Evidência real e limites

- Do Codespace, o principal retornou 403 com desafio HTML do Cloudflare nas consultas GET
  ao índice, OpenAPI, herói e perfil sem credencial. Isso não prova indisponibilidade global.
- O espelho respondeu ao índice e ao OpenAPI com HTTP 200/JSON.
- GET público de herói por ID no espelho retornou code 0, nome Miya, função Marksman,
  rota Gold Lane e URL de imagem. O diagnóstico reproduz a consulta pelo nome.
- GET de perfil sem credencial no espelho retornou 401 UNAUTHORIZED, exigindo Bearer JWT.
- Nenhum POST de envio de código, login ou logout foi feito. Perfil autenticado e
  revogação real ainda não foram validados. A existência do contrato e o índice
  declarar que tudo está operacional não provam essas operações.
- Não foram observados cabeçalhos Deprecation ou Sunset nas respostas GET inspecionadas.

## Como verificar esta entrega

```sh
npm run check
npm run rone:check
```

O [diagnóstico público](../src/check-rone.ts) faz somente três GETs: OpenAPI, herói Miya
e perfil sem credencial. Confirma os quatro contratos sem marca de descontinuação,
o herói com nome e a rejeição 401 esperada. Não usa tokens nem acessa contas.

Usa fetch nativo, User-Agent identificado, timeout de 10 segundos por requisição,
sem retries ou fallback automático. RONE_API_BASE_URL escolhe explicitamente o host,
com padrão https://arena.fastapicloud.dev/api. Para comparar o principal:

```sh
RONE_API_BASE_URL=https://arena.rone.dev/api npm run rone:check
```

Se houver timeout, 403/HTML, 503 ou formato inesperado, o diagnóstico termina com erro.
Compartilhe apenas a mensagem, sem credenciais. O 401 esperado no teste sem credencial
não indica que uma sessão sua expirou e não comprova funcionamento do login.

Conceitos TypeScript: unknown exige examinar os dados antes de usá-los;
o type guard objeto verifica se um valor é um objeto; as const preserva os valores
literais da lista de caminhos e métodos; async/await aguarda as respostas HTTP.

Prática: explique por que o 401 esperado não comprova que o login real funcionará.
O diagnóstico público foi confirmado no seu terminal antes da entrega 2 abaixo.

## Entrega 2: cliente HTTP com respostas tipadas

O [cliente](../src/rone/client.ts) concentra a comunicação externa. Seus métodos
solicitarCodigo, autenticar, consultarPerfil, encerrarSessao e consultarHeroi só fazem
requisições quando chamados. O bot ainda não chama esses métodos e /vincular ainda
não está disponível. A autenticação real continua pendente.

Os [tipos](../src/rone/types.ts) descrevem os poucos campos usados e os erros tratados.
IDs permanecem strings no código; IDs do jogo são validados como inteiros positivos
seguros antes da conversão para o contrato externo. Não se deve converter IDs do Discord.
O login verifica se os IDs recebidos correspondem aos solicitados e descarta o token
secundário. Isso ainda não é um vínculo: o futuro fluxo deverá consultar o perfil,
comparar novamente os IDs e só então persistir o vínculo com unicidade no PostgreSQL.

Nenhum código, JWT, resposta completa de autenticação ou causa de erro externa é
registrado. ErroRone fornece categorias como timeout, nao_autenticado, rejeitada,
indisponivel e resposta_invalida. HTTP 401 significa autenticação recusada; HTTP 403
é tratado como bloqueio/indisponibilidade, não como prova de sessão expirada. Um code
numérico não zero em HTTP 200 significa operação recusada sem inferir sua causa.

O cliente usa timeout de 10 segundos e não segue redirecionamentos nem repete
requisições. Timeout não garante que o servidor não recebeu uma operação.

### Verificação

```sh
npm run check
npm test
npm run rone:hero -- Miya
```

Os [testes](../src/rone/client.test.ts) usam node:test e transporte simulado: não fazem
chamadas de rede, envio real de código ou login real. Cobrem contratos de requisição,
campos obrigatórios, identidade divergente, dados vazios, HTTP 401/403/422/429/503,
JSON inválido, timeout, falha de rede e ausência de retries. Ainda não há armazenamento
nem testes de unicidade de vínculo, que pertencem à próxima entrega.

A [entrada pública](../src/try-rone.ts) faz uma única consulta real de herói. Deve
exibir nome, funções, rotas e imagem. Você também pode executar:

```sh
npm run rone:hero -- "Luo Yi"
```

Se aparecer um erro, compartilhe só a categoria e a mensagem. Não use métodos de
autenticação manualmente nesta etapa: o primeiro teste real será iniciado por você
na interação privada do vínculo, depois de prepararmos fluxo e persistência.

Conceitos TypeScript: type descreve objetos; campos string | null indicam que um
dado pode estar ausente; import type importa apenas definições de tipos; ErroRone
estende Error e possui uma categoria que o comando Discord poderá tratar.
O parâmetro transporte permite trocar fetch por uma função simulada nos testes.
Não usamos conversão de tipo para presumir que JSON externo seja um perfil válido.

Prática: no retorno de PerfilRone, por que nome pode ser null? Explique também por
que autenticar retornar uma sessão ainda não deve salvar o vínculo. Execute os três
comandos de verificação e envie o resultado antes da etapa de persistência.

## Entrega 3: persistência local e confirmação antes de salvar

PostgreSQL local via Docker foi escolhido para esta entrega. Adicionamos somente
pg e @types/pg; a criptografia usa node:crypto e os testes continuam com node:test.

### Arquivos e responsabilidades

- [compose.yaml](../compose.yaml): PostgreSQL 17 com porta local 5432, healthcheck e volume persistente.
- [postgres-init.sql](../docker/postgres-init.sql): cria chicago_test na primeira inicialização do volume.
- [Migration 001](../migrations/001_create_mlbb_links.sql): cria mlbb_links sem apagar registros existentes.
- [Conexão](../src/db/pool.ts), [migration](../src/db/migrate.ts) e [verificação](../src/db/check.ts): comandos pequenos de administração.
- [Preparação local](../src/db/setup-local.ts): gera senha e chave aleatórias, preservando valores existentes no ambiente.
- [Proteção do JWT](../src/vinculos/tokens.ts): AES-256-GCM com IV aleatório, tag de autenticação e IDs como dados autenticados adicionais.
- [Repositório](../src/vinculos/repository.ts): SQL parametrizado para inserir, consultar e apagar vínculos.
- [Conclusão do vínculo](../src/vinculos/service.ts): login, consulta do perfil, comparação dos IDs e, só então, inserção.
- [Tipos e erros](../src/vinculos/types.ts): IDs como strings e erros controlados sem detalhes sensíveis do banco.

O JWT é a única credencial persistida, sempre cifrada. Não guardamos o código de
verificação nem o token secundário do login. A tabela guarda somente os IDs, o JWT
cifrado e a data de criação, sem copiar o perfil inteiro. Os IDs associados ao JWT
fazem parte da autenticação criptográfica, impedindo mover o ciphertext para outra
identidade sem detectar a troca. A chave não é salva no banco ou no Git.

discord_id é a chave primária; UNIQUE(role_id, zone_id) impede a mesma conta em
outro Discord, inclusive em chamadas concorrentes. INSERT não faz transferência
automática ou sobrescrita. A remoção funciona mesmo se o JWT cifrado estiver
danificado. A revogação remota será responsabilidade do futuro comando /desvincular;
apagar a linha no banco, por si só, não revoga uma sessão na API.

### Como executar

Os passos de preparação e migration já foram executados neste Codespace. Em um
ambiente novo, use a sequência abaixo a partir da raiz do projeto:

```sh
npm ci
npm run db:setup
docker compose up -d --wait
npm run db:migrate
npm run db:check
```

db:setup preenche POSTGRES_PASSWORD, POSTGRES_PORT, DATABASE_URL, TEST_DATABASE_URL
e RONE_TOKEN_ENCRYPTION_KEY no arquivo local de ambiente, que continua ignorado pelo
Git. Não imprime segredos, não altera valores existentes e restringe as permissões
do arquivo. A geração usa 32 bytes aleatórios para a chave. Não substitua a chave
para reiniciar o projeto: sessões já cifradas dependem dela. Uma rotação de chave
precisará de um procedimento próprio, fora desta entrega.

Para verificar esta entrega no ambiente atual:

```sh
docker compose ps
npm run db:check
npm run check
npm test
npm run test:db
```

db:check deve confirmar conexão, tabela e formato da chave. Ele não lê sessões reais
e não comprova que a chave corresponde a uma sessão previamente armazenada.
Para inspecionar somente a estrutura com seu conhecimento de PostgreSQL:

```sh
docker compose exec postgres psql -U chicago -d chicago -c '\d mlbb_links'
```

Para parar o serviço use docker compose stop; para voltar use docker compose up -d --wait.
O volume guarda os dados entre reinícios do container. A durabilidade depende de
preservar esse volume e o ambiente; não é um backup fora do Codespace.

### O que os testes comprovam

- [Criptografia](../src/vinculos/tokens.test.ts): cifrar/decifrar, IVs diferentes e recusa de chave, identidade, IV, tag ou conteúdo alterados.
- [Fluxo](../src/vinculos/service.test.ts): nenhuma inserção antes de perfil confirmado, recusa de IDs divergentes e de falhas de autenticação, sem repetição de login.
- [PostgreSQL real](../src/vinculos/repository.test.ts): migration reaplicável, recuperação após reabrir conexões, constraints, concorrência, credenciais danificadas e remoção.

test:db usa TEST_DATABASE_URL, cria um schema de nome aleatório no banco de testes e
remove somente esse schema ao terminar. Os dados e tokens são fictícios; nenhum teste
faz login na Rone Arena. Falhas reais de autenticação continuam dependendo do seu teste
no Discord depois da etapa de comandos. O pool do bot ainda não foi conectado à entrada
do Discord; /ping permanece independente do banco nesta etapa.

Se a porta 5432 estiver ocupada, configure POSTGRES_PORT e as duas URLs de conexão
com a mesma porta livre. Se a migration falhar, confirme docker compose ps, a conexão
e a permissão de criar tabelas. Se o volume já existia antes de adicionar o SQL de
inicialização, o banco de testes pode ser criado com:

```sh
docker compose exec postgres createdb -U chicago chicago_test
```

Conceitos TypeScript: Pick seleciona os métodos de que uma função depende, permitindo
simular apenas a API ou a gravação nos testes; Promise<void> representa uma operação
assíncrona sem valor de retorno; campos #privados escondem a chave dentro da instância.
As consultas usam parâmetros $1, $2 etc.; os valores não são concatenados no SQL.

Prática: ao inspecionar a tabela, identifique qual constraint protege cada regra:
uma conta por Discord e um dono por conta do jogo. Explique por que verificar a
disponibilidade com SELECT antes do INSERT não substitui UNIQUE sob concorrência.

Aguarde confirmar esta entrega antes de registrar /vincular e conectar o modal privado.

## Entrega 4: vínculo privado dentro do Discord

Os comandos /vincular, /perfil e /desvincular estão conectados à API e à persistência.
/ping foi preservado. /heroi ainda ficará para a próxima entrega, após seu teste do vínculo.

### Arquivos desta etapa

- [Definições dos comandos](../src/discord/commands.ts): opções de IDs como strings.
- [Registro](../src/register-commands.ts): POST de cada definição na guild de testes, preservando outros comandos.
- [Tratamento de interações](../src/discord/rone-interactions.ts): respostas privadas, botão, modal, perfil e remoção.
- [Tentativas temporárias](../src/vinculos/pending.ts): IDs da conta, usuário, guild, expiração e estado; não guarda código nem JWT.
- [Fluxo de vínculo e desvinculação](../src/vinculos/service.ts): confirmação antes de salvar e logout com remoção local.
- [Repositório](../src/vinculos/repository.ts): verifica conflitos antes de solicitar código, mantendo as constraints como proteção final.
- [Entrada do bot](../src/index.ts): conecta os componentes e fecha o pool ao encerrar.
- [Testes de interações](../src/discord/rone-interactions.test.ts), [estado temporário](../src/vinculos/pending.test.ts) e [serviço](../src/vinculos/service.test.ts): simulações sem contas reais.

### Como funciona

/vincular usa deferReply com MessageFlags.Ephemeral antes de consultar banco ou API.
Se não houver conflito, uma única chamada solicita o código. A resposta privada
contém um botão. O botão abre imediatamente o modal; não é possível abrir o modal
após já adiar a resposta da mesma interação. Ao enviar o modal, uma nova interação
recebe deferReply privado enquanto login e perfil são consultados.

A tentativa expira em cinco minutos contados desde o início do envio, fica restrita
ao usuário e à guild e é consumida antes de iniciar o login. Não há retry de código
ou login, nem reuso do mesmo modal para uma segunda autenticação. Código inválido no
formato é recusado antes de login e permite abrir o botão novamente enquanto válido.
Após tentativa de login recusada, inicie /vincular novamente por uma ação explícita.

O estado fica em memória com limpeza de expirados durante o uso. Execute apenas uma
instância do bot nesta fase; reiniciar invalida tentativas pendentes, mas preserva os
vínculos já confirmados. O bloqueio por usuário evita desvincular enquanto o login ou
outra operação estiver em andamento. O banco continua responsável pela unicidade final.

/perfil consulta a sessão salva e só exibe o perfil se os IDs corresponderem ao vínculo.
Sem vínculo, orienta iniciar /vincular; HTTP 401 informa sessão expirada ou recusada.
Timeout, bloqueio e indisponibilidade não são apresentados como sessão expirada.
/desvincular cancela uma tentativa pendente, tenta logout quando consegue recuperar a
credencial e remove os dados locais. Falha no logout não impede apagar a credencial,
mas a resposta informa que a revogação remota não foi confirmada. Se o banco falhar,
não anuncia remoção concluída. Nenhum código ou JWT é incluído em respostas ou logs.

### Roteiro manual — esta entrega

1. Confira o PostgreSQL e os testes:

   ```sh
   docker compose up -d --wait
   npm run db:check
   npm run check
   npm test
   npm run test:db
   ```

2. Pare qualquer instância anterior do bot com Ctrl+C. Registre as definições se
   ainda não tiverem sido registradas nesta etapa e inicie o processo atualizado:

   ```sh
   npm run commands:register
   npm start
   ```

3. No servidor de testes, execute /ping para conferir a funcionalidade anterior.
4. Execute /perfil antes de vincular: deve informar ausência de vínculo, em privado.
5. Execute /vincular jogador:SEU_ID servidor:SEU_SERVIDOR usando somente sua conta.
   Esta ação solicita o código real. Se a API falhar, pare e informe somente a
   mensagem de erro, sem código, token ou conteúdo do formulário.
6. Confira o correio do jogo. No Discord, clique em Informar código e preencha o
   formulário privado. Aguarde a confirmação de autenticação, perfil e vínculo salvo.
7. Execute /perfil e confira nome, IDs e nível disponíveis, em privado.
8. Reinicie o bot e execute /perfil: o vínculo deve continuar disponível.
9. Execute /vincular novamente: deve recusar antes de solicitar outro código.
10. Execute /desvincular: deve confirmar remoção local e informar o resultado do logout.
11. Execute /perfil novamente: deve informar ausência de vínculo.

Valide apenas sua própria conta. Tentativas de usar a conta em outro Discord,
concorrência, uso indevido de modal, expiração e erros de autenticação já têm testes
simulados; não exigem testar contas de terceiros. Opcionalmente, inicie outra tentativa
sua e aguarde cinco minutos sem usar o código: o botão deve informar expiração.

Automático: testes simulados das interações, privacidade, expiração, uso único e
tratamento de falhas; testes de constraints e ciphertext em PostgreSQL real com
dados fictícios; tipos e compilação. Dependem da sua validação: entrega real do código,
login aceito pela API, perfil autenticado real, apresentação no Discord e revogação real.

Conceitos TypeScript: Map guarda tentativas por identificador; Set marca usuários com
operações em andamento; a união de estados permite distinguir envio, espera e login;
os métodos isButton/isModalSubmit/isChatInputCommand permitem ao compilador reconhecer
os campos de cada interação. finally libera o estado mesmo quando uma operação falha.

Prática: explique por que o modal usa uma nova interação e por que precisamos de on,
em vez de once, para tratar seus envios. Envie o resultado do roteiro antes de avançarmos.

## Entrega 5: /heroi nome

O vínculo real foi validado pelo usuário. O comando /heroi agora usa o cliente HTTP
existente para consultar uma ficha com nome, função, rota e imagem. É uma consulta
pública: não consulta o banco nem exige vínculo. A resposta é privada, como as outras
consultas deste bot, e usa deferReply antes de acessar a API.

Arquivos alterados: [definições](../src/discord/commands.ts),
[interações](../src/discord/rone-interactions.ts) e seus
[testes](../src/discord/rone-interactions.test.ts). Não há dependências novas.
Função, rota ou imagem ausentes não são inventadas. Erros de herói inexistente,
timeout e indisponibilidade são tratados pelo cliente já implementado.

Para testar, registre as definições caso ainda não tenham sido atualizadas nesta
entrega e reinicie o bot, mantendo somente uma instância:

```sh
npm run commands:register
npm start
```

No servidor de testes execute /heroi nome:Miya e /heroi nome:Luo Yi. A ficha deve
mostrar somente nome, função, rota e imagem disponíveis, com crédito à fonte.
Experimente um nome inexistente: deve informar ausência de resultado ou recusa da API,
sem encerrar o bot. Confira também /ping e /perfil para verificar as funções anteriores.

Verificação local: npm run check, npm test e npm run build. Os testes novos simulam
consulta sem vínculo, campos opcionais ausentes, resultado inexistente e indisponibilidade.
A consulta pública real pela entrada rone:hero verifica o transporte; renderização e
invocação no Discord dependem do seu teste.

Conceitos: uma função recebe HeroiRone e transforma dados tipados em EmbedBuilder;
join transforma uma lista de funções/rotas em texto; || fornece uma descrição quando
o texto está vazio. Prática: explique por que /heroi não precisa recuperar o JWT do jogador.

### Ampliação solicitada: histórico e estatísticas

Você também solicitou histórico, winrate com determinado herói e estatísticas.
Esses pedidos continuam no plano, em entregas após validar /heroi:

1. /historico: últimas partidas da temporada, com resultado, herói e K/D/A, limitado
   à conta vinculada e a uma quantidade pequena por resposta.
2. /winrate heroi: taxa calculada com wc/tc do resumo hi da temporada em
   /user/matches/hero/{hero_identifier}, não com uma página parcial do histórico.
   Quando tc for zero, informar ausência de partidas em vez de dividir por zero.
3. /estatisticas: partidas, vitórias, taxa de vitórias, média de nota e MVPs,
   somente conforme campos disponíveis e validados.

Na nova inspeção de 2026-11-26, /user/season, /user/matches,
/user/matches/hero/{hero_identifier}, /user/heroes/frequent e /user/stats continuam
marcados deprecated no OpenAPI. Não significa que foram removidos; a implementação
deverá informar essa dependência e tratar recusa ou indisponibilidade sem inventar dados.
Histórico e resumo por herói exigem sid obtido da lista de temporadas.
Sua disponibilidade autenticada será validada pelos seus comandos, não por consultas
a contas de terceiros. O pedido novo amplia o escopo inicial, que excluía partidas.

## Entrega 6: /historico da conta vinculada

Você confirmou /heroi no Discord. Esta entrega adiciona somente o histórico, antes
dos comandos de winrate e estatísticas já solicitados. Nenhuma dependência, tabela,
envio de código ou login adicional foi adicionado.

O comando aceita temporada e quantidade opcionais. Consulta /user/season com o JWT
da própria conta vinculada, valida os IDs retornados e seleciona o maior ID quando
nenhuma temporada é informada. Isso é uma escolha padrão explícita; não comprova
que essa seja a temporada atual do calendário. A temporada é exibida na resposta.
Uma opção explícita deve constar da lista retornada para essa conta.

Em seguida consulta uma única página de /user/matches com sid e limit. Quantidade
padrão: 5; mínimo: 1; máximo: 10. A ficha privada exibe herói, resultado, K/D/A e data
quando disponíveis. Não grava partidas no banco e não calcula winrate de uma página
parcial. IDs numéricos de partida e cursores grandes não são usados nem convertidos.
Quando a API informa mais partidas, a ficha deixa claro o limite desta primeira página.

Fontes de temporadas e histórico permanecem deprecated na inspeção de 2026-11-26.
A resposta informa a dependência e trata indisponibilidade sem presumir que os exemplos
da documentação funcionem na sua sessão. HTTP 401 informa sessão expirada ou recusada;
falhas de rede, timeout, formato e operação recusada não são confundidas com expiração.
Campos opcionais ausentes não viram zero, vitória ou derrota presumida.

Arquivos alterados:

- [Tipos](../src/rone/types.ts): PartidaRone e HistoricoRone.
- [Cliente](../src/rone/client.ts): consultarTemporadas e consultarHistorico, com validação dos dados utilizados.
- [Definições](../src/discord/commands.ts): /historico e opções inteiras com limites.
- [Interações](../src/discord/rone-interactions.ts): consulta autenticada e ficha privada.
- [Testes HTTP](../src/rone/client.test.ts) e [testes de interações](../src/discord/rone-interactions.test.ts): transporte simulado e casos de erro.

### Teste manual desta entrega

Pare a instância antiga com Ctrl+C. Atualize o registro se necessário e inicie:

```sh
npm run commands:register
npm start
```

No servidor de testes, com sua própria conta já vinculada, execute:

```text
/historico
/historico quantidade:3
```

Confira temporada, até a quantidade pedida, resultado, herói e K/D/A. O horário usa
o formato de data do Discord. Para escolher outra temporada, use temporada:ID; se
ela não estiver disponível, o bot informa até 20 IDs retornados para sua conta.
Confira também /perfil, /heroi e /ping para validar as funcionalidades anteriores.

Se a resposta indicar sessão recusada, /perfil ajuda a verificar o acesso ao perfil;
se o perfil funciona e o histórico falha, informe a mensagem do histórico sem credenciais.
Não precisa desfazer o vínculo por timeout ou indisponibilidade do endpoint descontinuado.
Uma lista vazia significa apenas que a API não retornou partidas para aquele recorte.

Automático: tipos, compilação e testes simulados de temporadas, partidas, resultados,
K/D/A ausente versus zero, limites e falhas, sem contas reais. Depende do seu teste:
disponibilidade autenticada real, exatidão das partidas retornadas e apresentação no Discord.

Conceitos TypeScript: map transforma cada registro validado em PartidaRone; Set remove
temporadas duplicadas; sort ordena os IDs; a união de resultados evita tratar campo
ausente como vitória ou derrota. O operador ?? usa o valor alternativo somente para
null/undefined, preservando zero mortes. Prática: por que usar || aqui mostraria um
resultado errado para zero mortes? Aguardo seu teste antes de implementar /winrate.

## Investigação: histórico recusado pela API

No primeiro teste real de /historico, a API respondeu com code numérico diferente
de zero. A implementação anterior preservou somente a categoria rejeitada, portanto
esse resultado não permite distinguir recusa da lista de temporadas e da lista de
partidas, nem identificar sua causa exata. Isso não prova que o vínculo esteja inválido.

Foi adicionado um diagnóstico restrito a essas duas operações: nome da operação,
status HTTP e código numérico de resultado. Mensagem externa, corpo, query string,
headers, códigos de verificação e JWTs continuam descartados. A validação exige um
inteiro seguro para o código de resultado. Não adicionamos retries ou troca de host.

Para continuar a investigação, reinicie o bot e execute /perfil e /historico uma vez
cada. Não é necessário registrar comandos novamente, pois as definições não mudaram.
Informe somente se /perfil funcionou e a nova mensagem do histórico. A nova resposta
identifica consulta de temporadas ou consulta de partidas e o código recebido.
HTTP 200 significa que a requisição HTTP foi atendida; code diferente de zero significa
que a operação foi recusada pela aplicação. Um código de resultado desconhecido não
será convertido em sessão expirada ou ausência de partidas sem evidência.

O código público da Rone Arena encaminha perfil e battle reports por caminhos internos
diferentes. Isso explica por que sucesso no perfil não comprova funcionamento do
histórico, mas não determina a causa desta recusa; testes simulados validam apenas
que o diagnóstico é seguro e correto.

### Resultado confirmado pelo usuário

Em 2026-11-26, /perfil continuou funcionando e /historico retornou recusa de
temporadas: GET /api/user/season, HTTP 200, code 10407. A consulta de partidas
não foi executada, pois a lista necessária de temporadas não foi obtida.
O comando de histórico está implementado, mas não foi validado como funcional
com dados reais; a dependência externa permanece recusando essa operação.

A [nota oficial da versão 1.1.0](https://arena.rone.dev/blog/rone-arena-1-1-0-release-notes)
associa 10407 a outro endpoint desligado pelo serviço de dados do jogo, o de
avaliações de heróis. Essa referência não documenta o significado universal do
código nem comprova o desligamento de temporadas. A hipótese de restrição no serviço
de origem é compatível com os sintomas, mas não foi confirmada para esta rota.
Não foi encontrada correção documentada para este caso de temporadas.

Não foi feita nova consulta autenticada pelo agente, tentativa de login, troca de
credencial ou alteração de host. Não há evidência para apagar um vínculo cujo perfil
funciona. Não alteramos parâmetros ou autenticação por tentativa e erro.

O winrate pessoal por temporada também depende da lista de temporadas neste plano,
portanto não pode ser apresentado como funcional enquanto essa dependência falhar.
O endpoint /user/stats é separado, está deprecated e ainda não teve funcionamento real
validado nesta conta; a falha de temporadas não prova que ele também falhe.

Informações suficientes para uma consulta ao mantenedor, sem credenciais ou dados da conta:
GET /api/user/season?lang=pt no espelho arena.fastapicloud.dev, HTTP 200, code 10407,
enquanto GET /api/user/info com a mesma sessão funciona. Perguntas: qual o significado
de 10407 para temporadas e há um fluxo ou endpoint substituto suportado? Nenhum contato
externo foi enviado pelo agente.

## Entrega 7: /estatisticas

Esta entrega consulta GET /api/user/stats?lang=pt com a sessão da própria conta vinculada,
sem depender de /user/season ou do histórico. O endpoint continua deprecated no contrato
consultado em 2026-11-26. Sua disponibilidade autenticada real ainda aguarda seu teste.
A recusa 10407 observada em temporadas não comprova a mesma falha em estatísticas.

O comando usa deferReply privado antes de consultar banco e API. Exibe os totais
fornecidos em tc (partidas), wc (vitórias), mvpc (MVPs) e as/100 (média de nota).
Calcula winrate geral como (wc/tc)*100 somente com os dois totais válidos e tc maior
que zero. Os totais não são apresentados como uma temporada específica ou toda a
carreira: o período não é informado por esse contrato e fica explícito na ficha.

Zero partidas não vira uma porcentagem calculada; zero vitórias com partidas é 0%.
Campos ausentes ficam não informados, não viram zero. Payload sem qualquer dos campos
usados, números negativos/não finitos, contagens fracionárias ou vitórias maiores que
partidas são recusados como resposta inválida. A média e a taxa são formatadas com
duas casas decimais. Não há gravação de estatísticas no PostgreSQL.

Arquivos alterados: [tipos](../src/rone/types.ts), [cliente HTTP](../src/rone/client.ts),
[comandos](../src/discord/commands.ts), [interações](../src/discord/rone-interactions.ts),
[testes HTTP](../src/rone/client.test.ts) e [testes de interações](../src/discord/rone-interactions.test.ts).
Nenhuma dependência, configuração de credenciais ou migration nova foi necessária.

O diagnóstico seguro foi estendido para estatísticas: code diferente de zero pode
exibir operação, HTTP e código numérico, sem mensagem externa, corpo ou token. Uma
recusa mantém o vínculo. Se a rota recusar autenticação, o bot orienta conferir /perfil
antes de desfazer um vínculo que pode continuar válido. Não há retry automático.

### Verificação e teste manual

```sh
npm run check
npm test
npm run build
```

Esses comandos verificam tipos, testes simulados e compilação, sem acessar contas reais.
Os testes cobrem cálculo, conversão da nota, zero/ausência/inconsistência de dados,
consulta privada sem dependência de temporadas, falhas e diagnóstico sem credenciais.
O código 10407 nos testes de estatísticas é uma resposta simulada, não um resultado
real observado nessa rota.

Depois de registrar o comando nesta entrega, pare a instância anterior com Ctrl+C
e execute npm start. Se precisar registrar em outro momento, use npm run commands:register.
No servidor de testes, execute /perfil e depois /estatisticas uma vez. Se funcionar,
confira os totais e a conta: por exemplo, 6 vitórias em 10 partidas correspondem a 60%.
Se falhar, envie apenas a mensagem privada de erro. Não copie JWTs ou códigos.

Não foi feita consulta real de estatísticas pelo agente. A disponibilidade e os dados
reais dependem da sua validação no Discord. Histórico permanece recusado em temporadas;
winrate pessoal por herói segue pendente dessa investigação, sem dados inventados.

Conceitos: number | null diferencia dado ausente de zero; condições verificam o divisor
antes do cálculo; toLocaleString formata porcentagem e nota em pt-BR sem modificar o
valor numérico usado na conta. Prática: por que zero partidas não significa winrate 0%?
Aguardo o resultado do seu teste antes de avançar.

## Plano original de referência

1. Cliente HTTP da Rone Arena: tipos dos dados utilizados, validação básica, timeout,
   erros seguros e testes simulados de falhas, sem contas reais.
2. Persistência e fluxo de vínculo: PostgreSQL com migration simples, uma conta por
   Discord e unicidade do par role_id/zone_id garantidas por constraints. IDs do Discord
   permanecem strings. JWT com AES-256-GCM e chave externa ao banco e ao repositório.
   Estado temporário com expiração e uso único pode começar em memória; reiniciar o bot
   exigirá reiniciar o vínculo. Redis somente se necessário.
3. Interações privadas: /vincular solicita código apenas por ação explícita, botão abre
   modal privado para o código; login seguido de perfil deve confirmar os mesmos IDs
   antes de salvar. Sem retries automáticos de envio ou login. Consultas usam deferReply.
4. /perfil distingue ausência de vínculo e sessão inválida; /desvincular remove dados e
   tenta revogação, informando se a revogação remota não puder ser confirmada.
5. /heroi nome exibe somente nome, função/rota e imagem. Preservar /ping e o registro
   restrito à guild de testes. Ao concluir, executar roteiro manual completo no Discord.

## Fontes

- [Repositório](https://github.com/ridwaanhall/rone-arena-api)
- [Swagger](https://arena.rone.dev/api/docs)
- [OpenAPI](https://arena.rone.dev/api/openapi.json)
- [Playground de usuários](https://arena.rone.dev/web/user)
- [Índice principal](https://arena.rone.dev/api)
- [Espelho](https://arena.fastapicloud.dev/api)
- [Implementação das rotas](https://github.com/ridwaanhall/rone-arena-api/blob/main/src/app/api/routers/user.py)

Dados do jogo © Moonton. API mantida por ridwaanhall / RoneAI.
Integração comunitária não oficial com [Rone Arena](https://arena.rone.dev).
