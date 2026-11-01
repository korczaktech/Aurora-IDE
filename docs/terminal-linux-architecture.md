# Aurora Terminal Linux — arquitetura da Fase 1

## Objetivo

Executar um ambiente Linux emulado dentro da aba do navegador. O usuário acessa o Aurora IDE pelo site e não instala o Aurora, Node.js, Python, Linux, máquinas virtuais ou aplicativos nativos no dispositivo.

## Arquitetura

1. **Aurora IDE** mantém a interface, sessões e o painel de terminal.
2. **xterm.js** continua sendo a camada visual e de entrada.
3. **AuroraLinuxRuntime** controla o ciclo de vida do emulador e configura o console serial xterm.js nativo do v86.
4. **v86** emula uma máquina x86 no navegador, usando JavaScript e WebAssembly.
5. **Imagem Linux** é carregada como recurso estático; não há servidor de execução de comandos.

O runtime é carregado sob demanda, somente quando o usuário seleciona **Iniciar Linux**. A barra permite reiniciar ou encerrar a máquina virtual. O terminal local já existente permanece disponível e não é substituído durante esta fase.

## Recursos fixados

- v86: versão npm `0.5.473`.
- Biblioteca e WebAssembly: pacote npm versionado, baixado durante o deploy e publicado como arquivo estático no domínio do Aurora.
- Biblioteca, WebAssembly e BIOS: recursos públicos do projeto v86, baixados durante o deploy e publicados como arquivos estáticos no domínio do Aurora. O kernel Buildroot é carregado por HTTPS do espelho público `alizafarbati/WebLinux` no GitHub Raw, que mantém uma cópia do exemplo de boot do v86. A origem upstream é `copy.sh`/`i.copy.sh`; o navegador não depende do host que respondeu HTTP 403 no teste de CI.
- Memória padrão: 128 MiB para a máquina virtual e 8 MiB para vídeo.
- Limites configuráveis: 64–512 MiB de RAM, 1–16 MiB de vídeo e timeout de inicialização entre 10 e 180 segundos.

O bootstrap atual usa o kernel Buildroot publicado para o exemplo serial oficial do v86, com filesystem 9p vazio. Ele fornece um shell BusyBox mínimo para validar o console serial, não um ambiente de desenvolvimento com toolchain ou gerenciador de pacotes. A imagem final de desenvolvimento será definida e preparada na Fase 2.

## Limites conhecidos

- v86 emula x86 de 32 bits; não oferece kernel convidado de 64 bits nem múltiplos núcleos.
- Desempenho depende da CPU, memória e navegador do usuário.
- O kernel Buildroot selecionado é o mesmo usado no exemplo serial oficial do v86 e disponibiliza um shell BusyBox pelo console serial. A inicialização do emulador não garante, sozinha, que o shell convidado já esteja pronto.
- Rede do sistema convidado e compartilhamento do projeto ainda não são ativados nesta fase.
- A biblioteca, o WebAssembly e as BIOS são publicados no mesmo domínio do Aurora. O kernel Buildroot é obtido do GitHub Raw no início do terminal, usando um host que permite requisições CORS.
- O ambiente não deve ser anunciado como compatível com todos os programas Linux.

## Segurança e privacidade

- O runtime não recebe nem enumera o diretório local do usuário.
- Nenhum handle da File System Access API é passado ao emulador.
- Não há ponte de arquivos, montagem 9p ou acesso ao restante do dispositivo nesta fase.
- Os recursos são carregados por HTTPS; o deploy fixa a versão npm do v86 em `0.5.473` e registra checksums SHA-256 dos assets publicados em `runtime/linux/SHA256SUMS.txt`. Os avisos de licença do v86 e da BIOS acompanham os assets.
- O emulador roda na aba; encerrar o terminal chama o encerramento do emulador.
- A autorização do projeto continua controlada pelo gerenciador de projetos existente.

## Validação

A suíte automatizada valida a versão fixada, URLs, limites de memória, timeout, rejeição de esquemas inseguros e ciclo de vida. O deploy executa ainda um smoke test real em Chromium headless: baixa o kernel, inicializa o Linux, espera o prompt BusyBox, executa um comando `echo`, confirma o retorno ao prompt e encerra a máquina virtual.

## Licença de terceiros

O projeto v86 é distribuído sob Simplified BSD License. Consulte https://github.com/copy/v86/blob/master/LICENSE. O espelho do kernel identifica `alizafarbati/WebLinux` como repositório de origem e `copy.sh`/`i.copy.sh` como hospedagem upstream das imagens; preserve as licenças e atribuições aplicáveis aos componentes Linux/Buildroot e v86.
