# Autoatendimento de boosters

Prioridade atual do projeto. Desenvolvimento Rone Arena suspenso, preservando código,
vínculos e comandos existentes. Sem dependências novas, Redis, VIPs ou pagamentos.

## Entregas 2 e 3 — atendimento e cargo persistidos

Criar/Editar agora consultam o boost e abrem ou recuperam o canal privado. O fluxo
coleta nome, sólido/gradiente, um/dois HEX e ícone opcional. O resumo oferece Confirmar,
Voltar e Cancelar. **Confirmar cria e atribui o cargo**, ou atualiza o cargo já salvo.
O cargo de booster gerenciado pelo Discord e cargos alheios não são alterados.

Posicionamento atual: use **Equipe também no campo referencia** para colocar os
cargos personalizados logo abaixo dela, acima dos cargos comuns. A configuração
do servidor de testes foi ajustada para essa referência e os dois cargos ativos
foram reposicionados e conferidos pela API. Cargos protegidos de moderação/administração
devem ficar acima do limite Equipe; o maior cargo do bot também precisa ficar acima
da referência. Permissões em cargos de outros bots não os classificam automaticamente
como cargos da equipe. Uma referência alternativa ainda pode escolher uma faixa inferior.

A [regra de posicionamento](../src/boosters/role-position.ts) considera o índice antes
e depois de remover o cargo da ordenação. Isso coloca o cargo logo abaixo da referência
tanto ao subir quanto ao descer, sem o deslocamento de uma posição que ocorria ao
sempre subtrair 1. As permissões do cargo continuam zeradas.

A [migration 004](../migrations/004_booster_benefits.sql) cria `booster_benefits`:
chave `(servidor_id, usuario_id)`, referências únicas de canal/cargo, sessão, revisão,
etapa, preferências e estado do benefício. Criar e Editar convergem para o mesmo fluxo.

### Como testar agora

```sh
npm run db:migrate
npm start
```

Pare a instância anterior antes de iniciar. Os comandos administrativos não mudaram;
não é necessário registrar comandos novamente. Repita `/booster configurar` com as
mesmas opções se desejar atualizar o texto do painel.

1. Como booster já existente, clique Criar meu cargo. A resposta privada deve apontar
   para o canal acessível a solicitante, bot e equipe, considerando o acesso de admins.
2. Informe nome e estilo. Gradiente só é oferecido com ENHANCED_ROLE_COLORS. Use HEX
   completo, como `#AD75FF`; formato inválido não avança a etapa.
3. Com ROLE_ICONS, envie pelo modal uma **imagem PNG, JPEG ou WebP, até 256 KiB, sem resolução obrigatória**, ou continue
   sem ícone. Não precisamos de MessageContent nem de mensagens comuns com anexos.
4. Confira o resumo, use Voltar se necessário e confirme. Verifique o cargo atribuído,
   permissões zero, menção desativada e posição abaixo da referência. Cargos superiores
   podem prevalecer na aparência do nome.
5. Encerre o atendimento. O canal continua legível, com envio bloqueado ao solicitante.
   Reabrir pelo painel restaura o envio e permite editar o mesmo cargo.
6. Clique novamente em Criar meu cargo, altere a cor e confirme. Confira que continua
   existindo **um único ID de cargo** e que o mesmo canal foi reutilizado.
7. Reinicie durante a coleta; continue pela mensagem existente e confira a retomada.
8. Outro membro não deve ver o canal sem ser equipe/admin. Mesmo quem tem acesso
   por ser da equipe não pode operar os controles do proprietário.
9. Não compre boosts para testar. O caso elegível e falhas de criação/atribuição são
   simulados nos testes automatizados. Um booster já existente pode validar o fluxo real.

Prática: explique a diferença entre a chave única do benefício e a revisão dos botões.
A primeira protege a propriedade; a segunda rejeita controles e formulários de etapas antigas.

### Persistência e recuperação

Correção da confirmação: `Role.edit()` devolve uma cópia do cargo; a ordenação do
gerenciador deve resolver a instância em cache pelo ID. Agora usamos
`guild.roles.setPosition(cargo.id, ...)`, preservando o cargo já registrado. Um teste
reproduziu a falha de usar a cópia e passou depois da correção. Erros ao editar,
posicionar ou atribuir informam a operação e, quando disponível, HTTP e código do
Discord, sem incluir corpo da requisição, credenciais ou imagem.

Ícones não exigem mais dimensões exatas: PNG, JPEG e WebP são aceitos sem bloquear
pela resolução. Mantemos o limite de 256 KiB e a validação básica de formato.
O bot envia a imagem original à API; não faz redimensionamento local nem garante
que todo arquivo aceito pela checagem básica será aceito pelo Discord.

O [serviço](../src/boosters/benefit-service.ts) coordena as regras. O
[repositório](../src/boosters/benefit-repository.ts) bloqueia operações por membro/servidor
no PostgreSQL. O [adaptador](../src/boosters/benefit-discord.ts) chama o Discord;
os [componentes](../src/discord/booster-wizard.ts) e as
[interações](../src/discord/booster-ticket-interactions.ts) apresentam e processam etapas.
Cada controle é validado contra usuário, canal, sessão, revisão e etapa persistidos.

Verificamos ManageChannels, ManageRoles, categoria e hierarquia antes de criar recursos.
O canal recebe overwrites explícitos, sem herdar acessos públicos da categoria.
O bot precisa ver/gerenciar canais e gerenciar permissões na categoria; no atendimento,
precisa também de envio, embeds, anexos e histórico. Revalidamos features e hierarquia
antes de aplicar, e boost na confirmação e junto à atribuição.

POSTs de criação não têm retry automático. Primeiro salvamos a intenção, criamos um
cargo provisório de permissões zero e salvamos seu ID **antes de editar e atribuir**.
Falha na atribuição mantém o ID para nova tentativa. Cancelar uma edição não modifica
o cargo já ativo. O ícone tem validação básica de cabeçalho e tamanho;
isso não substitui a aceitação final do arquivo completo pelo Discord.

Não há transação conjunta entre banco e Discord. Se a criação do cargo ocorrer e a
resposta ou gravação do ID se perder, `cargo_estado = criando` impede outro POST.
A equipe deve verificar na auditoria o autor bot, proprietário e operação no motivo.
Somente após comprovar a origem, um administrador do banco pode recuperar `cargo_id`
e definir `cargo_estado = pendente`. Não adote cargos pelo nome, nem limpe uma pendência
para repetir criação sem confirmar que o cargo anterior não existe.

Um canal com criação sem confirmação é procurado pelo marcador no tópico. Ausência ou
múltiplas candidatas interrompem o fluxo para revisão. Para um canal já registrado,
a retomada faz uma consulta atual: somente `HTTP 404 / código 10003 (Unknown Channel)`
autoriza recriar o atendimento no próximo clique do membro. O vínculo com o cargo,
preferências, proprietário e etapa são preservados; as referências antigas de canal e
mensagem são substituídas sob bloqueio por membro. Não há migração nem exclusão de cargo.
Timeout, HTTP 403, marcador divergente e outros erros não autorizam outro canal.
Cargo registrado e excluído continua exigindo revisão, sem nova criação automática.
Erros locais anteriores ao POST e recusas HTTP 400/403/404 permitem nova tentativa após
correção; falhas ambíguas preservam a pendência.

Diagnóstico do painel: logs e respostas informam a operação e metadados permitidos
(por exemplo, `abrir ou retomar atendimento; Discord HTTP 404, código 10003`).
Não registram mensagem/stack/cause do erro, corpo da API, URL, IDs, imagem ou credenciais.
`ECONNREFUSED` indica que a conexão ao serviço falhou; confira PostgreSQL com
`docker compose --env-file .env up -d --wait postgres` e `npm run db:check`.
Banco acessível não comprova que os canais do Discord ainda existem: são recursos
independentes e precisam de verificação separada.

Os [testes do serviço](../src/boosters/benefit-service.test.ts) cobrem elegibilidade,
HEX, propriedade, cliques, revisão, retorno/cancelamento, retomada e falhas. Os
[testes de interação](../src/discord/booster-ticket-interactions.test.ts) validam modais
reais do SDK e privacidade. Os [testes PostgreSQL](../src/boosters/benefit-repository.test.ts)
usam schemas isolados e conferem unicidade, bloqueios e atribuição após reconexão.
Nenhum teste automatizado usa contas ou boosts reais.

Convite automático e retirada ao perder boost continuam na entrega 4, após seu teste.
Esta entrega impede nova atribuição sem elegibilidade; ainda não retira automaticamente
um cargo já atribuído. A regra proposta continua sendo retirar da pessoa e preservar
cargo/configuração, reconciliando na inicialização sem enviar DMs em massa.

Referências: [criação de cargos](https://docs.discord.com/developers/resources/guild#create-guild-role),
[cores/hierarquia](https://docs.discord.com/developers/topics/permissions),
[upload em modal](https://docs.discord.com/developers/components/reference#file-upload),
[limites de ícones](https://support.discord.com/hc/en-us/articles/4409571023639-Custom-Role-Icons-FAQ).

## Entrega 1 — configuração, painel e elegibilidade

Registro histórico: as limitações de criação desta primeira entrega foram superadas
pelas entregas 2 e 3 acima.

Implementado:

- `/booster configurar`, restrito a administradores no registro e no processamento.
  O adaptador também atualiza membro e cargos pela API antes de autorizar a publicação.
- Configuração por servidor e referência do painel persistidas no PostgreSQL.
- Embed com “Criar meu cargo”, “Editar meu cargo” e “Ajuda”, publicada e fixada.
- Repetir o comando no mesmo canal atualiza a mensagem existente.
- Botões com identificadores estáveis, tratados no evento geral de interações;
  não dependem de collectors temporários ou de estado em memória.
- Respostas privadas com `deferReply` antes de consultas externas.
- Cada clique em criar/editar busca o próprio membro pela API com `force: true`.
  `premiumSinceTimestamp !== null` indica elegibilidade; não é contador de boosts.
- Painéis antigos ou mensagens diferentes da referência persistida são rejeitados.

### Imagem do painel

A [arte fornecida](../assets/booster-panel.png) é enviada como anexo e exibida dentro
do embed com `attachment://`. Após atualizar/reiniciar o bot, administradores podem usar:

- `/booster imagem arquivo:<imagem>`: substitui a imagem na mesma mensagem do painel.
- `/booster imagem`, sem arquivo: restaura a arte padrão fornecida.

PNG, JPEG, GIF e WebP são aceitos, com limite de 5 MiB. O bot confere tamanho, assinatura
básica do formato e MIME; isso não é uma decodificação completa da imagem. O download usa
somente anexos do CDN do Discord, sem redirecionamentos, com timeout de 10 segundos e
limite também durante a leitura. URLs e conteúdo dos anexos não são registrados em logs.

A imagem personalizada é salva como `BYTEA` em `booster_config.imagem_painel` pela
[migration 003](../migrations/003_booster_panel_image.sql). Assim não dependemos do
prazo de validade do link do anexo recebido pelo comando. `NULL` seleciona a arte padrão.
Uma nova configuração ou reinício preserva a escolha. Ao editar a mensagem, substituímos
o anexo anterior em vez de acumular arquivos. Se a edição falhar, a escolha permanece
salva e `/booster configurar` pode reaplicá-la; não é criada outra mensagem.

O bot também precisa de **AttachFiles / Anexar arquivos** no canal do painel.
O comando exige Administrator e responde em privado. Primeiro publique o painel com
`/booster configurar`; o comando de imagem não cria painéis quando não há referência.
Os testes cobrem validação, permissões administrativas, restauração, edição sem
duplicação, preservação ao reconfigurar e persistência da imagem após reconexão.

Nesta entrega, criar/editar **somente verificam elegibilidade** e explicam a etapa
seguinte. Ainda não criam canal, atendimento, preferência ou cargo. Ajuda não exige
boost. Nenhum código público permite contornar elegibilidade.

### Como executar e testar

PostgreSQL local já configurado no projeto. Para preparar um ambiente que estava parado:

```sh
docker compose --env-file .env up -d postgres
npm run db:migrate
npm run commands:register
```

Pare a instância anterior do bot com Ctrl+C e execute:

```sh
npm start
```

No servidor de testes, como administrador:

1. Escolha um canal de texto existente para o painel e uma categoria existente para
   os futuros atendimentos. Escolha o cargo da equipe autorizada.
2. Escolha um cargo de referência, abaixo do maior cargo do bot, do cargo da equipe
   e dos cargos com Administrator, ManageRoles, ManageGuild, ModerateMembers,
   KickMembers ou BanMembers. Futuros cargos personalizados ficarão abaixo dele.
   Caso precise criar essa referência, faça isso na configuração de cargos do servidor.
3. Use `/booster configurar`, preenchendo `painel`, `categoria`, `equipe` e `referencia`
   com esses canais/cargos. Não é necessário copiar IDs para variáveis de ambiente.
4. Confira a embed e sua fixação. Repita o comando: deve continuar existindo uma
   única mensagem, com a mesma referência.
5. Clique em Ajuda. Criar/Editar devem responder em privado conforme seu boost atual.
   Se você não é booster, a recusa é o resultado esperado. Não compre boost para testar;
   o caso elegível é coberto por simulação automatizada e pode ser validado por um
   booster já existente, se disponível.
6. Reinicie o bot e use os botões da mesma mensagem, sem publicar novamente.
7. Um membro sem Administrator não deve conseguir configurar o painel, mesmo que
   alguém altere a visibilidade do comando nas configurações do Discord.
8. Confira `/ping` e, se desejar, `/perfil`, para verificar os fluxos existentes.

O comando é registrado somente no servidor de testes configurado. A configuração
tem chave por servidor; outros servidores ainda não são habilitados pelo roteador.
Nenhuma mensagem de painel ou DM é enviada até uma interação administrativa explícita.

### Permissões e diagnóstico

No canal do painel o bot precisa de ViewChannel, SendMessages, EmbedLinks, AttachFiles,
ReadMessageHistory e **PinMessages**. Essa última é a permissão atual de fixação;
não assumimos que ManageMessages a substitui. O bot valida essas permissões antes
de publicar. Se elas mudarem durante a operação e a fixação falhar, a referência
da mensagem continua salva; corrija a permissão e repita o comando.

Para mover o painel nesta versão, exclua a mensagem antiga e execute o comando
com o novo canal. Falha de acesso ao canal antigo não comprova exclusão: restaure
o acesso antes de continuar. Não recriamos automaticamente uma mensagem ao receber 403.

PostgreSQL e Discord não oferecem uma transação conjunta. Usamos bloqueio consultivo
por servidor e gravamos a intenção de publicação antes de enviar. O envio usa nonce
com `enforceNonce` para evitar duplicação em repetições próximas da mesma requisição.
Se o envio ficar sem confirmação, a próxima tentativa busca o marcador do painel nas
últimas 100 mensagens do canal. Ao encontrá-lo, salva a referência e reutiliza a mensagem.
Se não puder confirmar, interrompe sem reenviar.

Limite desta recuperação: se a mensagem sair desse recorte ou tiver sido excluída
antes de registrar seu ID, será necessária inspeção administrativa. Primeiro localize
a mensagem do próprio bot com o marcador “Chicago · Benefício booster · ID do servidor”.
Com o bot parado, um responsável pelo banco pode corrigir `mensagem_painel_id` e
`painel_pendente` na linha daquele servidor. Só limpe a pendência para permitir novo
envio depois de confirmar que nenhuma mensagem da tentativa anterior existe. Não faça
essa alteração em caso de dúvida; envie apenas a mensagem de erro para investigarmos.

Todos os IDs são strings em TypeScript. As credenciais continuam no ambiente local;
não há novas variáveis necessárias e nenhum segredo é armazenado na configuração booster.

### Arquivos e conceitos

- [Tipos](../src/boosters/types.ts): `type`, `interface` e `Omit` descrevem dados e
  contratos pequenos. A entrada administrativa não contém a referência da mensagem.
- [Elegibilidade](../src/boosters/eligibility.ts): recebe uma função de consulta;
  isso permite testar regras sem Discord real e mantém a regra separada do cargo.
- [Persistência](../src/boosters/repository.ts) e [migration](../migrations/002_booster_config.sql):
  uma linha por servidor, `upsert` e bloqueio consultivo de sessão PostgreSQL.
  As gravações são confirmadas individualmente para sobreviver à falha entre banco e API.
- [Publicação](../src/boosters/panel.ts): coordena envio, retomada, edição e fixação.
- [Adaptador Discord](../src/boosters/discord.ts): consultas atuais, permissões,
  hierarquia, chamadas HTTP por discord.js e reconhecimento da mensagem do próprio bot.
- [Componentes](../src/discord/booster-panel.ts) e
  [interações](../src/discord/booster-interactions.ts): apresentação e respostas privadas.
- [Executor de migrations](../src/db/migrations.ts): aplica SQLs numerados em ordem,
  registra os nomes em `schema_migrations` e usa transação para reverter falhas.
  A migration inicial idempotente permite adotar bancos existentes sem apagar vínculos.

Prática: explique por que um erro de rede ao consultar um membro não pode ser
interpretado como “deixou de ser booster”. Depois identifique no código onde o cache
é ignorado e por que os botões continuam funcionando após reiniciar.

### Verificação automatizada

```sh
npm run check
npm test
npm run test:db
npm run build
```

Os testes de regras/interações não acessam Discord nem contas reais. Cobrem boost
ativo/inativo, falha de consulta, consulta com `force: true`, identidade do solicitante,
administração, painel inválido, privacidade, cliques repetidos, reutilização da mensagem,
falha ao fixar e envio com resposta perdida.

Os testes PostgreSQL usam somente TEST_DATABASE_URL e schemas temporários com dados
fictícios. Cobrem migrations, preservação de vínculo existente, reconexão, configuração,
pendência durável e bloqueios entre instâncias. Sem TEST_DATABASE_URL, esses testes
são explicitamente ignorados. A aparência do painel, as permissões reais e a interação
com um booster real dependem da validação manual acima.

## Planejamento original e progresso

Entregas 2 e 3 implementadas na seção atual acima. Somente a entrega 4 permanece pendente.

2. Canal privado único e preferências persistidas: nome, sólido/gradiente, HEX e ícone.
   Resumo com Confirmar, Voltar e Cancelar. Testes de HEX, acesso alheio e retomada.
3. Criar/editar cargo cosmético e atribuir exclusivamente ao proprietário, com
   revalidação antes de aplicar. Persistir cargo criado antes de atribuir e recuperar
   falhas sem criar outro. Verificar novamente permissões e hierarquia.
4. Convite por DM no início do boost e remoção do cargo ao perder elegibilidade.
   Falha de DM será registrada sem interromper o bot; painel permanece como alternativa.

Regra apresentada antes de implementar a entrega 4: retirar o cargo da pessoa ao
perder elegibilidade, preservar cargo e escolhas, sem exclusão automática. Revalidar
benefícios registrados na inicialização e pelo painel, sem DMs em massa. Erro de rede
não equivale a perda de boost. As duas entradas convergirão para o mesmo atendimento.

## Documentação conferida

Inspeção em 2026-11-26, discord.js instalado 14.28.1, conferido também nos tipos e
implementação local da biblioteca:

- [Membro individual](https://docs.discord.com/developers/resources/guild#get-guild-member):
  GET individual nesta entrega, sem listar todos os membros.
- [Eventos de membro](https://docs.discord.com/developers/events/gateway-events#guild-member-update):
  `premium_since` indica início do boost, sem contar boosts. Eventos requerem
  GuildMembers, que será habilitado no código e no Portal na entrega 4.
- [Cargos](https://docs.discord.com/developers/resources/guild#create-guild-role) e
  [cores/hierarquia](https://docs.discord.com/developers/topics/permissions):
  ManageRoles, permissões explicitamente zero, mentionable false, nome até 100 caracteres;
  usar `colors`, duas cores só com ENHANCED_ROLE_COLORS e ícone só com ROLE_ICONS.
  A validação e a aplicação desses dados entram nas entregas 2 e 3.
- [Upload em modal](https://docs.discord.com/developers/components/reference#file-upload):
  FileUploadBuilder em LabelBuilder, arquivos recebidos por getUploadedFiles.
  Não precisamos ler mensagens nem habilitar MessageContent para receber o ícone.
  Filtragem visual do upload não substitui validação do conteúdo e tamanho da imagem.
- [Fixar mensagem](https://docs.discord.com/developers/resources/message#pin-message):
  PinMessages e endpoint atual, já utilizado pela versão instalada.
- [Envio com nonce](https://docs.discord.com/developers/resources/message#create-message):
  deduplicação do mesmo autor por alguns minutos; não substitui persistência nem reconciliação.

Consulta de leitura ao servidor de testes confirmou ENHANCED_ROLE_COLORS e ROLE_ICONS
na inspeção. Nas próximas entregas consultaremos as features novamente antes de oferecer
e aplicar recursos. Não fixaremos disponibilidade com base nesta observação.

## Encerramento com exclusão do canal

O botão de encerramento, disponível após concluir ou cancelar, apaga o canal
privado do atendimento. A exclusão confere o marcador de propriedade do canal e
mantém o cargo, seu proprietário e as preferências no PostgreSQL. Não há nova
migration: as referências de canal e mensagem ficam nulas e o estado fica fechado.
Ao usar o painel novamente, um novo canal é criado e o cargo salvo é reutilizado.
Se faltar Gerenciar canais, o estado permanece aberto e o solicitante pode tentar
novamente. Canal já excluído (HTTP 404 / 10003) é tratado como exclusão concluída.

Verificação manual após reiniciar o bot:
1. Conclua ou cancele seu próprio atendimento e clique para encerrar.
2. Confira que o canal desapareceu e que o cargo continua atribuído.
3. Clique em Editar meu cargo pelo painel: deve abrir um novo canal com as
   preferências anteriores; ao confirmar, o mesmo cargo deve ser atualizado.
4. Confira que cliques de outro membro não encerram o seu atendimento.

Testes automatizados usam adaptadores simulados: exclusão, falha de permissão,
marcador de propriedade, idempotência, referências limpas, controles antigos,
resposta antes da exclusão e reabertura mantendo o cargo. A exclusão real no Discord
depende da validação manual acima.
