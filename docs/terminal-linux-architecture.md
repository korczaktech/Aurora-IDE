# Aurora Terminal Linux — arquitetura

## Objetivo

Executar um ambiente Linux emulado dentro da aba do navegador. O usuário acessa o Aurora IDE pelo site e não instala o Aurora, Node.js, Python, Linux, máquinas virtuais ou aplicativos nativos no dispositivo.

## Arquitetura

1. **Aurora IDE** mantém a interface, sessões e o painel de terminal.
2. **xterm.js** continua sendo a camada visual e de entrada.
3. **AuroraLinuxRuntime** controla o ciclo de vida do emulador e configura o console serial xterm.js nativo do v86.
4. **v86** emula uma máquina x86 no navegador, usando JavaScript e WebAssembly.
5. **Imagem Linux** é carregada como recurso estático; não há servidor de execução de comandos.

O runtime é carregado sob demanda, somente quando o usuário seleciona **Iniciar Linux**. A barra permite reiniciar, sincronizar ou encerrar a máquina virtual. O terminal local já existente permanece disponível e não é substituído. Apenas uma máquina Linux pode ficar ativa por vez para limitar o consumo de RAM; as sessões do terminal local continuam independentes.

## Recursos fixados

- v86: versão npm `0.5.473`.
- Biblioteca, WebAssembly e BIOS: recursos públicos do projeto v86, baixados durante o deploy e publicados como arquivos estáticos no domínio do Aurora. O kernel Buildroot é carregado por HTTPS do espelho público `alizafarbati/WebLinux` no GitHub Raw, que mantém uma cópia do exemplo de boot do v86. A origem upstream é `copy.sh`/`i.copy.sh`; o navegador não depende do host que respondeu HTTP 403 no teste de CI.
- Memória padrão: 128 MiB para a máquina virtual e 8 MiB para vídeo.
- Limites configuráveis: 64–512 MiB de RAM, 1–16 MiB de vídeo e timeout de inicialização entre 10 e 180 segundos.

O bootstrap usa o kernel Buildroot publicado para o exemplo serial oficial do v86 e o shell BusyBox. O filesystem 9p é preenchido com uma cópia do projeto autorizado antes do boot; depois do prompt, o guest monta esse filesystem em `/workspace`. O shell Linux opera sobre essa árvore real, não sobre comandos simulados do terminal JavaScript.

## Integração com projetos

- O runtime recebe somente o `FileSystemDirectoryHandle` do projeto atualmente aberto pelo gerenciador de projetos Aurora, que já restringe a seleção a `.aurora/projects`.
- Antes de iniciar o guest, o bridge consulta a permissão `readwrite`, lê arquivos e diretórios e cria a árvore no filesystem 9p do v86.
- Limites de importação: até 3.000 arquivos, 8 MiB por arquivo e 48 MiB no total. Itens acima dos limites são ignorados e contabilizados no status do terminal; não são silenciosamente considerados sincronizados.
- O botão **Sincronizar projeto** copia arquivos novos e alterações do Linux para a pasta autorizada. Encerrar o Linux ou fechar a sessão também tenta sincronizar antes de desligar.
- A sincronização compara cada arquivo com a cópia original e com o arquivo atual no dispositivo. Se o arquivo também mudou no editor/dispositivo desde o início da sessão, a alteração é marcada como conflito e não sobrescreve o conteúdo do usuário.
- Arquivos excluídos dentro do Linux não são excluídos automaticamente do projeto local. A sincronização é deliberadamente não destrutiva.
- Depois da sincronização, o gerenciador de projetos recarrega os arquivos do disco para atualizar árvore e editor.

## Ferramentas e rede

O sistema convidado atual é um Linux mínimo com os applets BusyBox que acompanham a imagem. Não contém um gerenciador de pacotes, Node.js, npm, Git, Rust/Cargo ou GCC. A emulação v86 atual não oferece extensões x86-64 nem múltiplos núcleos; não se deve instalar ou anunciar toolchains incompatíveis com esse alvo. O terminal local do Aurora mantém os executores JavaScript em Worker e Python via Pyodide, mas eles são runtimes WebAssembly separados, não binários instalados dentro do Linux.

A rede do guest não está habilitada. O navegador do usuário continua tendo sua própria rede, mas isso não equivale a conectividade TCP/IP dentro do Linux; comandos `wget`, `curl`, `git clone` e gerenciadores de pacotes no guest não são suportados nesta configuração. Downloads de pacotes dentro do guest ainda não fazem parte do runtime.

Os arquivos do projeto permanecem no dispositivo por meio da File System Access API após a sincronização. O estado integral da máquina virtual, memória RAM do guest e pacotes instalados não são persistidos entre inicializações.

## Limites conhecidos

- v86 emula x86 de 32 bits; não oferece kernel convidado de 64 bits nem múltiplos núcleos.
- Desempenho depende da CPU, memória e navegador do usuário.
- O kernel Buildroot selecionado é o mesmo usado no exemplo serial oficial do v86 e disponibiliza um shell BusyBox pelo console serial. A inicialização do emulador não garante, sozinha, que o shell convidado já esteja pronto.
- Rede do sistema convidado não está ativada; o compartilhamento do projeto está disponível por 9p e sincronização explícita/não destrutiva.
- A biblioteca, o WebAssembly e as BIOS são publicados no mesmo domínio do Aurora. O kernel Buildroot é obtido do GitHub Raw no início do terminal, usando um host que permite requisições CORS.
- O ambiente não deve ser anunciado como compatível com todos os programas Linux.

## Segurança e privacidade

- O runtime não recebe nem enumera o diretório local do usuário.
- Nenhum handle da File System Access API é passado ao emulador.
- Não há ponte de arquivos, montagem 9p ou acesso ao restante do dispositivo.
- Os recursos são carregados por HTTPS; o deploy fixa a versão npm do v86 em `0.5.473` e registra checksums SHA-256 dos assets publicados em `runtime/linux/SHA256SUMS.txt`. Os avisos de licença do v86 e da BIOS acompanham os assets.
- O emulador roda na aba; encerrar o terminal chama o encerramento do emulador.
- A autorização do projeto continua controlada pelo gerenciador de projetos existente.

## Validação

A suíte automatizada valida a versão fixada, URLs, limites de memória, timeout, rejeição de esquemas inseguros, ciclo de vida, caminhos e cópia/sincronização com detecção de conflitos. O deploy executa um smoke test real em Chromium headless: baixa o kernel, inicializa o Linux, monta o projeto por 9p em `/workspace`, executa comandos no guest, cria um arquivo e confirma que a sincronização o grava de volta no diretório autorizado antes de encerrar a máquina virtual.

## Licença de terceiros

O projeto v86 é distribuído sob Simplified BSD License. Consulte https://github.com/copy/v86/blob/master/LICENSE. O espelho do kernel identifica `alizafarbati/WebLinux` como repositório de origem e `copy.sh`/`i.copy.sh` como hospedagem upstream das imagens; preserve as licenças e atribuições aplicáveis aos componentes Linux/Buildroot e v86.
