# Aurora IDE — Arquitetura técnica

## 1. Visão geral

Aurora IDE é composta por uma aplicação web estática e uma API independente. O frontend concentra apresentação e interação; o backend executa operações que exigem autenticação, persistência e acesso a processos do servidor.

Repositório: https://github.com/korczaktech/Aurora-IDE

## 2. Estrutura do código

| Caminho | Responsabilidade |
|---|---|
| `Front-End/WebSite/HTML` | Páginas e estrutura da aplicação |
| `Front-End/WebSite/CSS` | Estilos da interface |
| `Front-End/WebSite/JavaScript` | Comportamento do frontend |
| `Front-End/WebSite/SVG` | Ícones e recursos vetoriais |
| `Back-End/crates/aurora-api` | Servidor HTTP, rotas e estado da aplicação |
| `Back-End/crates/aurora-auth` | Cadastro, login, autenticação e autorização |
| `Back-End/crates/aurora-storage-mongodb` | Acesso ao MongoDB |
| `Back-End/crates/aurora-users` | Tipos de usuário e papéis |
| `Back-End/Motores/Terminal` | Gerenciamento de processos PTY |

## 3. Frontend

O site utiliza HTML, CSS e JavaScript sem um framework de aplicação. O conteúdo público é servido como arquivos estáticos.

O editor web de demonstração:
- disponibiliza arquivos iniciais HTML, CSS e JavaScript;
- permite edição no navegador;
- salva o conteúdo no `localStorage`;
- monta uma pré-visualização em iframe;
- encaminha mensagens de console da pré-visualização para a interface.

Esse mecanismo não concede acesso ao sistema de arquivos do host, não sincroniza arquivos com o backend e não compila linguagens nativas.

## 4. Backend e API

O backend utiliza Rust, Tokio e Axum. A API aplica CORS às origens configuradas e registra telemetria HTTP com tracing.

Rotas principais:
| Método | Rota | Finalidade |
|---|---|---|
| GET | `/` | Identificação do serviço |
| GET | `/health` | Liveness HTTP |
| GET | `/ready` | Prontidão com verificação do MongoDB |
| POST | `/auth/register` | Cadastro |
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Conta autenticada |
| POST | `/auth/logout` | Revogação da sessão |
| GET | `/admin/health` | Verificação administrativa |
| GET/POST/DELETE | `/terminal/sessions` e subrotas | Gerenciamento de sessões de terminal |
| WebSocket | `/terminal/ws` | Transporte interativo do PTY |

As rotas protegidas utilizam token Bearer no cabeçalho `Authorization`. O WebSocket do terminal utiliza ticket temporário emitido pela API.

## 5. Persistência e modelo de contas

A integração deve preservar o modelo compartilhado de contas da Korczak Technologies.

- Database `Contas`, coleção `contas`: fonte central dos registros de conta.
- Database `Aurora`, coleção `sessoes`: sessões de autenticação do Aurora.

Não criar coleções adicionais na database `Contas`. O adaptador MongoDB consulta e atualiza os documentos existentes na coleção `contas`; os índices específicos de sessão são criados em `Aurora.sessoes`.

A autenticação lê os campos de identificação, nome, e-mail, estado da conta, papel e hash de senha do documento central. O estado aceito é `Conta.Status = active`; os papéis reconhecidos são `admin` e `user`.

As senhas são verificadas com bcrypt. O token aleatório de sessão não é persistido em texto puro: o backend grava seu resumo SHA-256. A duração configurada é de 30 dias e a coleção de sessões utiliza índice TTL em `expiresAt`.

## 6. Motor de terminal

O motor utiliza `portable-pty` para criar pseudo-terminais e iniciar Bash. O backend mantém o vínculo entre sessão e conta proprietária, controla tickets de uso único com expiração curta, limita entradas e verifica a origem da conexão.

O diretório de trabalho padrão é `/tmp/aurora-workspaces`. A variável `AURORA_TERMINAL_WORKDIR` permite configurar outro caminho. Cada conta recebe um subdiretório próprio; em sistemas Unix, o backend aplica permissões restritas ao diretório.

### Limite de segurança

O processo Bash é executado no host do serviço e herda as permissões do processo da API. A implementação não constitui sandbox nem isolamento forte entre processos. Por esse motivo, a autorização do terminal é administrativa. Não conceder acesso a usuários comuns e não executar código não confiável nesse ambiente.

### Interface

O frontend utiliza xterm.js e seu complemento de ajuste de dimensões. A saída binária do PTY é transmitida por WebSocket e decodificada para o painel Output.

As áreas Debug Console, Problems e Ports não possuem motores conectados e não devem ser descritas como recursos operacionais.

## 7. Configuração e implantação

A API lê sua configuração de variáveis de ambiente. A lista e os nomes exatos devem ser mantidos sincronizados com `Back-End/crates/aurora-api/src/config.rs`. Segredos, tokens, URI de banco e credenciais nunca devem ser versionados.

Serviço de API configurado:
- `https://aurora-api-cc1d.onrender.com`

O frontend é estático e utiliza o domínio:
- `https://aurora.korczaktech.com.br`

A disponibilidade da API e do MongoDB deve ser verificada separadamente. `/health` confirma o processo HTTP; `/ready` verifica a prontidão das dependências de banco.

## 8. Testes e manutenção

O workspace Rust está em `Back-End/Cargo.toml`. Os comandos usuais, executados a partir de `Back-End`, são:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --release --workspace
```

A execução desses comandos deve ocorrer em ambiente com toolchain Rust estável e dependências disponíveis.

## 9. Regras de manutenção

1. Preservar a database compartilhada `Contas` e sua coleção `contas`.
2. Não adicionar coleções à database `Contas` sem uma decisão arquitetural explícita que considere todos os produtos Korczak.
3. Manter segredos exclusivamente em variáveis de ambiente e nos gerenciadores apropriados.
4. Não ampliar o acesso ao terminal sem implementar isolamento real de processos e revisão de segurança.
5. Atualizar esta documentação quando rotas, modelos, permissões ou integrações mudarem.
6. Distinguir sempre recursos implementados de elementos apenas visuais ou planejados.
