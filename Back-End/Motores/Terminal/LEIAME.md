# Motor de Terminal — Aurora IDE

Núcleo Rust que cria sessões Bash reais sobre pseudoterminais (PTY).

## Fase 1 implementada
- Sessões PTY independentes, com identificadores UUID.
- Inicialização de Bash interativo sem arquivos de perfil.
- Entrada, saída não bloqueante e redimensionamento.
- Diretório de trabalho e variáveis de ambiente configuráveis.
- Limite de sessões, encerramento individual e shutdown global.
- Canal de saída limitado para evitar crescimento ilimitado de memória.
- Testes de abertura, ciclo de vida, I/O real, limite e diretório inválido.

## Comandos
Execute a partir de Back-End:
- cargo fmt --all -- --check
- cargo clippy --workspace --all-targets -- -D warnings
- cargo test -p aurora-terminal
- cargo build -p aurora-terminal --release

A comunicação HTTP/WebSocket e a integração com a interface ficam para a Fase 2.
PTY não é sandbox: o shell herda as permissões do processo que hospeda o motor.
