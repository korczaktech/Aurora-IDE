# Aurora Terminal Linux — arquitetura da Fase 1

## Objetivo

Executar um ambiente Linux emulado dentro da aba do navegador. O usuário acessa o Aurora IDE pelo site e não instala o Aurora, Node.js, Python, Linux, máquinas virtuais ou aplicativos nativos no dispositivo.

## Arquitetura

1. **Aurora IDE** mantém a interface, sessões e o painel de terminal.
2. **xterm.js** continua sendo a camada visual e de entrada.
3. **AuroraLinuxRuntime** controla o ciclo de vida do emulador e configura o console serial xterm.js nativo do v86.
4. **v86** emula uma máquina x86 no navegador, usando JavaScript e WebAssembly.
5. **Imagem Linux** é carregada como recurso estático; não há servidor de execução de comandos.

O runtime é carregado sob demanda, somente quando o usuário seleciona **Iniciar Linux**. O terminal local já existente permanece disponível e não é substituído durante esta fase.

## Recursos fixados

- v86: versão npm `0.5.473`.
- Biblioteca e WebAssembly: pacote npm versionado, baixado durante o deploy e publicado como arquivo estático no domínio do Aurora.
- BIOS e kernel inicial: recursos públicos do projeto v86, baixados durante o deploy e publicados como arquivos estáticos no domínio do Aurora.
- Memória padrão: 128 MiB para a máquina virtual e 8 MiB para vídeo.
- Limites configuráveis: 64–512 MiB de RAM, 1–16 MiB de vídeo e timeout de inicialização entre 10 e 180 segundos.

O bootstrap atual usa o kernel Buildroot publicado para o exemplo serial oficial do v86, com filesystem 9p vazio. Ele fornece um shell BusyBox mínimo para validar o console serial, não um ambiente de desenvolvimento com toolchain ou gerenciador de pacotes. A imagem final de desenvolvimento será definida e preparada na Fase 2.

## Limites conhecidos

- v86 emula x86 de 32 bits; não oferece kernel convidado de 64 bits nem múltiplos núcleos.
- Desempenho depende da CPU, memória e navegador do usuário.
- O kernel Buildroot selecionado é o mesmo usado no exemplo serial oficial do v86 e disponibiliza um shell BusyBox pelo console serial. A inicialização do emulador não garante, sozinha, que o shell convidado já esteja pronto.
- Rede do sistema convidado e compartilhamento do projeto ainda não são ativados nesta fase.
- Os recursos do emulador são publicados no mesmo domínio do Aurora; a conexão externa é necessária durante o deploy, não a cada inicialização do terminal.
- O ambiente não deve ser anunciado como compatível com todos os programas Linux.

## Segurança e privacidade

- O runtime não recebe nem enumera o diretório local do usuário.
- Nenhum handle da File System Access API é passado ao emulador.
- Não há ponte de arquivos, montagem 9p ou acesso ao restante do dispositivo nesta fase.
- Os recursos são carregados do mesmo domínio por HTTPS; o deploy fixa a versão npm do v86 em `0.5.473` e registra checksums SHA-256 em `runtime/linux/SHA256SUMS.txt`.
- O emulador roda na aba; encerrar o terminal chama o encerramento do emulador.
- A autorização do projeto continua controlada pelo gerenciador de projetos existente.

## Validação

A suíte automatizada valida a versão fixada, URLs, limites de memória, timeout e rejeição de esquemas inseguros. O boot real e a disponibilidade do console serial precisam ser verificados em navegador suportado com rede habilitada; o CI de sintaxe não substitui esse teste de integração.

## Licença de terceiros

O projeto v86 é distribuído sob Simplified BSD License. Consulte o texto e os avisos atualizados em https://github.com/copy/v86/blob/master/LICENSE. A distribuição e o uso devem preservar os avisos de copyright e licença aplicáveis.
