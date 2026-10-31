# Motor de Terminal — Aurora IDE

Núcleo Rust que cria sessões Bash reais sobre pseudoterminais (PTY), exposto pela API Aurora e pelo painel inferior do editor.

## Fase 1 — núcleo PTY

- Sessões Bash independentes com identificadores UUID.
- Inicialização interativa sem arquivos de perfil.
- Entrada, saída binária e redimensionamento.
- Diretório de trabalho e variáveis de ambiente configuráveis.
- Limite de sessões, encerramento individual e shutdown global.
- Canal de saída limitado com backpressure para preservar bytes sem crescimento ilimitado de memória.
- Detecção de encerramento espontâneo e código de saída.

## Fase 2 — API e interface

### API HTTP

Todas as rotas abaixo exigem \`Authorization: Bearer <access_token>\` e uma conta com permissão administrativa. O terminal executa comandos com as permissões do processo do serviço; portanto, não é liberado para contas comuns enquanto não houver isolamento real de processos.

| Método | Rota | Função |
|---|---|---|
| GET | \`/terminal/sessions\` | Lista as sessões da conta autenticada |
| POST | \`/terminal/sessions\` | Cria uma sessão Bash |
| DELETE | \`/terminal/sessions/{id}\` | Encerra uma sessão própria |
| POST | \`/terminal/sessions/{id}/ticket\` | Emite ticket WebSocket de uso único |
| GET | \`/terminal/ws\` | Atualiza para WebSocket usando o ticket |

- Limite de quatro sessões ativas por conta e oito sessões ativas no processo.
- Tickets aleatórios de uso único, válidos por 30 segundos, com limite global de tickets pendentes.
- O ticket é enviado no subprotocolo \`aurora-ticket.<ticket>\`; o servidor negocia somente \`aurora-terminal\`, sem colocar credenciais na URL.
- A origem WebSocket precisa corresponder exatamente a uma entrada de \`CORS_ALLOWED_ORIGINS\`.
- Mensagens e frames recebidos têm limite de 64 KiB.
- O logout invalida tickets e encerra todas as sessões da conta.
- Cada conta recebe um diretório de trabalho próprio, com permissões Unix \`0700\` e validação do identificador usado no caminho.
- Nenhuma coleção nova é criada no MongoDB. A autenticação usa o armazenamento central de contas já existente.

### Protocolo WebSocket

- Cliente → servidor: mensagens JSON \`{"type":"input","data":"..."}\`, \`{"type":"resize","columns":120,"rows":30}\` e \`{"type":"ping"}\`.
- Servidor → cliente: mensagens JSON \`ready\`, \`error\`, \`pong\` e \`exit\`.
- A saída do PTY é enviada como frames binários para preservar os bytes e sequências ANSI; o cliente xterm.js recebe \`ArrayBuffer\`.
- O ticket é consumido durante o handshake e não pode ser reutilizado.

### Interface

- \`terminal.js\` conecta o painel inferior do editor à API e ao xterm.js.
- A interface permite criar, alternar, reconectar e encerrar sessões.
- O redimensionamento do painel ajusta as dimensões do PTY.
- A aba TERMINAL apresenta a sessão Bash real. OUTPUT, DEBUG CONSOLE, PROBLEMS e PORTS permanecem como áreas de interface sem adaptadores próprios nesta fase.

### Configuração do serviço

- \`MONGODB_URI\`: conexão com o MongoDB.
- \`MONGODB_ACCOUNTS_DATABASE=Contas\`: database central de contas.
- \`MONGODB_SESSIONS_DATABASE=Aurora\`: database de sessões do Aurora.
- \`CORS_ALLOWED_ORIGINS\`: lista separada por vírgulas das origens web autorizadas.
- \`AURORA_TERMINAL_WORKDIR\`: diretório raiz dos workspaces; padrão \`/tmp/aurora-workspaces\`.
- O ambiente de execução precisa disponibilizar Bash em \`/bin/bash\`.

## Limite de segurança conhecido

PTY não é sandbox. O Bash herda as permissões Unix do processo da API e pode acessar arquivos e recursos disponíveis para esse processo. Diretórios separados e permissões \`0700\` organizam os workspaces, mas não isolam processos entre contas que compartilham o mesmo usuário do sistema operacional. Por isso, o acesso continua restrito a administradores até uma fase específica de sandbox (por exemplo, contêiner/namespace isolado, limites de CPU/memória/tempo e filesystem por sessão) ser implementada e validada.

O filesystem padrão do Render pode ser efêmero. Não trate arquivos do workspace como armazenamento permanente; a persistência no Vault é uma integração separada.

## Verificações

Execute a partir de \`Back-End\`:

- \`cargo fmt --all -- --check\`
- \`cargo clippy --workspace --all-targets -- -D warnings\`
- \`cargo test --workspace\`
- \`cargo build --workspace --release\`
