# Chicago

Bot Discord desenvolvido em pequenas entregas com TypeScript e Node.js.

Prioridade atual: [autoatendimento de boosters](./docs/boosters.md).
Disponíveis: painel persistente, atendimento privado, preferências e criação/edição
do cargo com atribuição após confirmação. Um cargo por membro, recuperado nas edições.
`/ping`, `/vincular`, `/perfil`, `/desvincular` e `/heroi` continuam disponíveis.
O desenvolvimento Rone Arena está suspenso, preservando código e vínculos existentes.
`/historico` e `/estatisticas` foram descontinuados devido às limitações da fonte.
Consulte o [estado e as instruções atuais](./docs/rone-arena.md#estado-atual-fase-encerrada).
As entregas abaixo documentam o aprendizado desde o início do projeto.

## Entrega 1: executar TypeScript

Requisito: Node.js 24 LTS e npm. No Codespace usado nesta entrega, as versões
verificadas foram Node.js 24.22.2 e npm 11.19.1.

Ao abrir o projeto em um ambiente novo, instale as dependências:

```sh
npm ci
```

Na primeira entrega, o programa era executado com `npm start` e imprimia:

```text
Olá! Eu sou o Chicago. Esta é a etapa 1. Aprendendo: sim
```

Agora `npm start` conecta o bot ao Discord, conforme a etapa 2 abaixo.

Verifique os tipos:

```sh
npm run check
```

Se não houver erros, esse comando termina sem mensagens de diagnóstico.
O Node executa o arquivo TypeScript removendo as anotações de tipos, mas não
verifica os tipos. Por isso, a verificação é um comando separado.

Para conhecer a compilação, gere JavaScript e execute o resultado:

```sh
npm run build
node --env-file=.env dist/index.js
```

## Arquivos principais

- [src/index.ts](./src/index.ts): primeiro programa, com variáveis tipadas e uma mensagem no terminal.
- [package.json](./package.json): dependências e atalhos de comandos do npm.
- [tsconfig.json](./tsconfig.json): opções de verificação e compilação do TypeScript.
- [package-lock.json](./package-lock.json): versões exatas das dependências, usadas por `npm ci`.
- [.gitignore](./.gitignore): exclui dependências instaladas, arquivos compilados e arquivos de variáveis de ambiente do Git.

## Prática

1. Troque o valor de `nome` pelo nome que você quer dar ao bot.
2. Crie uma variável `aprendendo`, do tipo `boolean`, e inclua seu valor na mensagem.
3. Execute `npm run check` e `npm start` para verificar a mudança.
4. Temporariamente, atribua `"um"` à variável `etapa` e rode `npm run check`.
   Observe o arquivo, a linha e a explicação do erro: uma string não pode ser
   atribuída a uma variável declarada como `number`. Restaure o número ao terminar.

Compartilhe seu código e a saída dos comandos para revisarmos antes da próxima entrega.

## Discord — etapa 1: configuração local

O fluxo será carregar a configuração, conectar com discord.js, registrar `/ping`
apenas no servidor de testes e responder à interação recebida. Nesta etapa,
verificamos apenas a presença das variáveis, sem fazer chamadas ao Discord.

1. No [Discord Developer Portal](https://discord.com/developers/applications),
   crie ou selecione uma aplicação. Em **General Information**, copie o
   **Application ID**.
2. Em **Bot**, obtenha o token (use **Reset Token** se necessário). Guarde-o
   somente no ambiente local; não o compartilhe na conversa.
3. No Discord, ative **Configurações de usuário → Avançado → Modo de desenvolvedor**.
   Clique com o botão direito no seu servidor de testes e copie o ID do servidor.
4. Crie seu arquivo local, sem sobrescrever um arquivo existente:

   ```sh
   cp -n .env.example .env
   ```

5. Preencha no `.env` as três variáveis descritas em [.env.example](./.env.example).
   O token autentica o bot; o Application ID identifica a aplicação; o Guild ID
   identifica o servidor onde o comando será registrado.
6. Execute:

   ```sh
   npm run check
   npm run config:check
   git check-ignore .env
   ```

O verificador deve dizer que as três variáveis estão preenchidas. O último
comando deve imprimir `.env`, confirmando que o Git o ignora. Essa verificação
não confirma se o token é válido ou se os IDs pertencem à aplicação e ao servidor
corretos; isso será verificado ao conectar e registrar o comando nas próximas etapas.

Se faltar uma variável, a mensagem informa seu nome. Se aparecer que o arquivo
`.env` não foi encontrado, confira se ele existe na raiz do projeto e execute o
comando nessa pasta.

Prática: explique com suas palavras a diferença entre o Application ID e o Guild ID.
Informe apenas se os comandos passaram ou a mensagem de erro, sem os valores das variáveis.

## Discord — etapa 2: conectar o bot

O [programa principal](./src/index.ts) cria um cliente discord.js com o intent
`Guilds`, registra uma função para o evento `ClientReady` e inicia o login.
O evento indica que o cliente está pronto. `once` executa a função uma vez.
`await` aguarda a operação assíncrona de login, e `try/catch` trata sua falha.

Antes de iniciar, instale a aplicação no servidor de testes:

1. No Developer Portal, abra **Installation** e habilite **Guild Install**.
2. Nas configurações de instalação em servidor, selecione os scopes `bot` e
   `applications.commands`. Para esta etapa não é necessário conceder Administrator
   nem habilitar intents privilegiados.
3. Abra o link de instalação fornecido pelo Discord e selecione o servidor de testes.
   Sua conta precisa ter permissão para gerenciar esse servidor.

Execute:

```sh
npm run check
npm start
```

O terminal deve mostrar `Conectado ao Discord como ...` e confirmar a presença no
servidor de testes. O bot deve aparecer online no Discord. O processo permanece
em execução para receber eventos; pare com `Ctrl+C`.

Se o login falhar com `TokenInvalid`, confira se copiou o token da página **Bot**,
e não o Application ID ou Client Secret. Depois de redefinir o token no portal,
atualize seu arquivo local. Se conectar mas não encontrar o servidor, confira
o Guild ID e se a aplicação foi instalada no servidor correto.

Nesta etapa, confirme a conexão e a presença do bot no servidor antes de seguir
para o registro de `/ping` abaixo.

Prática: explique por que usamos `once` para a mensagem de prontidão e por que
o processo precisa continuar executando para o bot funcionar.

## Discord — etapa 3: registrar e responder /ping

O [script de registro](./src/register-commands.ts) usa `SlashCommandBuilder` para
definir o nome e a descrição do comando. O cliente `REST` envia essa definição
à API HTTP do Discord. A rota `applicationGuildCommands` usa o Application ID e
o Guild ID para registrar somente no servidor de testes. O método `POST` cria
ou atualiza `/ping`, preservando outros comandos existentes.

O registro faz o comando aparecer no Discord, mas quem responde é o processo do
bot. O [programa principal](./src/index.ts) escuta `InteractionCreate` com `on`,
filtra comandos de barra do servidor de testes chamados `ping` e responde com
`interaction.reply("Pong!")`. O filtro `isChatInputCommand()` também permite
que o TypeScript reconheça as propriedades específicas desse tipo de interação.

1. Encerre a versão anterior do bot com `Ctrl+C`, se estiver em execução.
2. Verifique os tipos e registre o comando:

   ```sh
   npm run check
   npm run commands:register
   ```

   A mensagem esperada é `Comando /ping registrado no servidor de testes.`.
   Repita o registro quando mudar nome, descrição ou opções; alterar apenas a
   resposta do bot exige reiniciar o processo, sem repetir o registro.
3. Inicie a versão atualizada:

   ```sh
   npm start
   ```

4. No servidor de testes, em um canal onde você possa usar comandos de aplicativos,
   digite `/ping`, selecione o comando desta aplicação e envie. A resposta deve
   ser `Pong!`. Execute novamente para confirmar que o bot responde a cada chamada.

Se o registro falhar com código `50001` (Missing Access), confira se instalou a
aplicação correta no servidor correto com os scopes `bot` e `applications.commands`.
O código `50035` indica dados inválidos na requisição; confira especialmente os IDs.
Se o registro passar mas o comando não aparecer, confira o servidor, as permissões
de uso de comandos no canal e reabra o cliente do Discord. Se o comando aparecer
mas a aplicação não responder, confira se o processo atualizado está executando
e procure erros no terminal. Mantenha apenas uma instância do bot em execução;
duas instâncias podem tentar responder à mesma interação e gerar o código `40060`.

Prática: depois de confirmar `Pong!`, altere a resposta para `Pong! Estou online.`,
reinicie o bot e teste. Explique por que essa alteração não exige registrar o comando
novamente. Compartilhe o resultado sem credenciais antes de avançarmos.

## Rone Arena — diagnóstico inicial

Execute `npm run rone:check` para verificar apenas acesso público, sem usar contas.
Veja os contratos, limitações e próximas etapas em [Integração Rone Arena](./docs/rone-arena.md).
