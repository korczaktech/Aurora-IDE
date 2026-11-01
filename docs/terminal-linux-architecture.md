# Aurora Terminal Linux — arquitetura da Fase 1

## Objetivo

Executar um ambiente Linux emulado dentro da aba do navegador. O usuário acessa o Aurora IDE pelo site e não instala o Aurora, Node.js, Python, Linux, máquinas virtuais ou aplicativos nativos no dispositivo.

## Arquitetura

1. **Aurora IDE** mantém a interface, sessões e o painel de terminal.
2. **xterm.js** continua sendo a camada visual e de entrada.
3. **AuroraLinuxRuntime** controla o ciclo de vida do emulador e faz a ponte com o console serial.
4. **v86** emula uma máquina x86 no navegador, usando JavaScript e WebAssembly.
5. **Imagem Linux** é carregada como recurso estático; não há servidor de execução de comandos.

O runtime é carregado sob demanda, somente quando o usuário seleciona **Iniciar Linux**. O terminal local já existente permanece disponível e não é substituído durante esta fase.

## Recursos fixados

- v86: versão npm `0.5.473`.
- Biblioteca e WebAssembly: jsDelivr, pacote npm versionado.
- BIOS e imagem inicial de Linux: distribuição pública do projeto v86 em `copy.sh/v86`.
- Memória padrão: 128 MiB para a máquina virtual e 8 MiB para vídeo.
- Limites configuráveis: 64–512 MiB de RAM, 1–16 MiB de vídeo e timeout de inicialização entre 10 e 180 segundos.

A imagem upstream é uma imagem mínima de demonstração para validar o boot/console. Não representa ainda a imagem final de desenvolvimento com toolchain; a seleção e construção dessa imagem fazem parte da evolução do ambiente na Fase 2.

## Limites conhecidos

- v86 emula x86 de 32 bits; não oferece kernel convidado de 64 bits nem múltiplos núcleos.
- Desempenho depende da CPU, memória e navegador do usuário.
- O terminal serial só terá prompt utilizável se a imagem convidada oferecer console serial compatível.
- Rede do sistema convidado e compartilhamento do projeto ainda não são ativados nesta fase.
- A disponibilidade de recursos externos depende de conectividade, CORS e dos respectivos CDNs.
- O ambiente não deve ser anunciado como compatível com todos os programas Linux.

## Segurança e privacidade

- O runtime não recebe nem enumera o diretório local do usuário.
- Nenhum handle da File System Access API é passado ao emulador.
- Não há ponte de arquivos, montagem 9p ou acesso ao restante do dispositivo nesta fase.
- Os recursos externos são carregados por HTTPS e a versão do pacote v86 é fixada.
- O emulador roda na aba; encerrar o terminal chama o encerramento do emulador.
- A autorização do projeto continua controlada pelo gerenciador de projetos existente.

## Validação

A suíte automatizada valida a versão fixada, URLs, limites de memória, timeout e rejeição de esquemas inseguros. O boot real e a disponibilidade do console serial precisam ser verificados em navegador suportado com rede habilitada; o CI de sintaxe não substitui esse teste de integração.

## Licença de terceiros

O projeto v86 é distribuído sob Simplified BSD License. Consulte o texto e os avisos atualizados em https://github.com/copy/v86/blob/master/LICENSE. A distribuição e o uso devem preservar os avisos de copyright e licença aplicáveis.
