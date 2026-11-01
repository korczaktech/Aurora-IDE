# Terminal Linux do Aurora — arquitetura

## Objetivo

Executar um ambiente Linux emulado dentro da aba do navegador. O usuário acessa o Aurora IDE pelo site e não instala o Aurora, Linux, Node.js, Python, máquinas virtuais ou aplicativos nativos no dispositivo. A execução do guest usa CPU e memória do próprio dispositivo; não existe servidor dedicado para executar comandos.

## Arquitetura

1. **Aurora IDE** mantém a interface, as sessões e o painel do terminal.
2. **xterm.js** fornece a camada visual e de entrada.
3. **AuroraLinuxRuntime** controla o ciclo de vida do emulador e configura o console serial xterm.js do v86.
4. **v86** emula uma máquina x86 no navegador usando JavaScript e WebAssembly.
5. **AuroraLinuxProjectBridge** copia os arquivos do projeto autorizado para o filesystem 9p e sincroniza as alterações permitidas de volta ao dispositivo.
6. **File System Access API** limita o acesso ao diretório do projeto que o usuário abriu no gerenciador Aurora.

O runtime é carregado sob demanda quando o usuário seleciona **Iniciar Linux**. A barra permite reiniciar, sincronizar ou encerrar a máquina virtual. O terminal local existente permanece disponível e não é substituído. Apenas uma VM Linux pode ficar ativa por vez para limitar o consumo de RAM; as sessões do terminal local continuam independentes.

## Componentes e recursos fixados

- v86: versão npm `0.5.473`.
- Biblioteca, WebAssembly e BIOS: recursos públicos do projeto v86, baixados durante o deploy e publicados como arquivos estáticos no domínio do Aurora.
- Kernel Buildroot: obtido por HTTPS do espelho público `alizafarbati/WebLinux`, fixado no commit `9be9b5f435281dc7d78467131dbc1b77e10a8198`, arquivo `images/buildroot-bzimage68.bin`, Git blob SHA-1 `39cc8e6542faefa33717eafaffad96200aa39de1`. A origem upstream declarada é `copy.sh`/`i.copy.sh`.
- Antes do boot, o runtime calcula o hash Git do conteúdo baixado — SHA-1 de `blob {tamanho}\0{conteúdo}` — e rejeita o kernel se não corresponder ao identificador fixado.
- Memória padrão: 128 MiB para a máquina virtual e 8 MiB para vídeo.
- Limites configuráveis do emulador: 64–512 MiB de RAM, 1–16 MiB de vídeo e timeout de inicialização entre 10 e 180 segundos.

O bootstrap usa o kernel Buildroot do exemplo serial oficial do v86 e o shell BusyBox. O filesystem 9p é preenchido com uma cópia do projeto autorizado antes do boot; depois que o prompt aparece, o guest monta esse filesystem em `/workspace`. Os comandos Linux operam sobre essa árvore real, não sobre comandos simulados pelo terminal JavaScript.

## Integração com projetos

- O runtime recebe somente o `FileSystemDirectoryHandle` do projeto atualmente aberto pelo gerenciador Aurora, que restringe a seleção a `.aurora/projects`. Nenhum diretório externo é enumerado.
- Antes de iniciar o guest, o bridge consulta a permissão `readwrite`, lê a estrutura autorizada e cria a árvore no filesystem 9p do v86.
- Limites de importação: até 3.000 arquivos, 8 MiB por arquivo e 48 MiB no total. Itens acima dos limites são ignorados e contabilizados no status do terminal.
- O botão **Sincronizar projeto** copia arquivos novos e alterações do Linux para a pasta autorizada. Encerrar o Linux ou fechar a sessão também tenta sincronizar antes de desligar.
- A sincronização compara cada arquivo com a cópia original e com o arquivo atual no dispositivo. Se o arquivo também mudou no editor/dispositivo desde o início da sessão, a alteração é marcada como conflito e não sobrescreve o conteúdo do usuário.
- Arquivos excluídos dentro do Linux não são excluídos automaticamente do projeto local. A sincronização é deliberadamente não destrutiva.
- Depois da sincronização, o gerenciador de projetos recarrega os arquivos do disco para atualizar a árvore e o editor.

## Ferramentas, rede e persistência

O guest atual é um Linux mínimo com os applets BusyBox incluídos na imagem. Ele não contém gerenciador de pacotes, Node.js, npm, Git, Rust/Cargo ou GCC. O terminal local do Aurora também oferece execução JavaScript em Worker e Python via Pyodide; esses são runtimes WebAssembly separados, não binários instalados dentro do Linux.

A emulação v86 utilizada não oferece extensões x86-64 nem múltiplos núcleos. Portanto, não é correto anunciar compatibilidade com toolchains ou programas que exijam essas capacidades.

A rede do guest não está habilitada. A rede disponível ao navegador não equivale a conectividade TCP/IP dentro do Linux; comandos `wget`, `curl`, `git clone` e gerenciadores de pacotes dentro do guest não são suportados nesta configuração. No terminal local do navegador, o comando `download URL [arquivo]` usa `fetch` com as regras CORS do navegador, exige HTTPS (exceto localhost), limita o arquivo a 16 MiB e grava somente dentro do projeto autorizado. Esse recurso não cria conectividade de rede dentro do Linux.

Os arquivos do projeto permanecem no dispositivo por meio da File System Access API após a sincronização. O estado integral da máquina virtual, a memória RAM do guest e pacotes instalados não são persistidos entre inicializações.

## Limites conhecidos

- v86 emula uma CPU x86 sem extensões de 64 bits e sem múltiplos núcleos.
- O desempenho depende da CPU, da memória e do navegador do usuário.
- O sistema convidado é mínimo e baseado no BusyBox; não equivale a uma distribuição Linux de desenvolvimento completa.
- A conectividade de rede do guest não está ativada.
- O ambiente não deve ser anunciado como compatível com todos os programas Linux.

## Segurança e privacidade

- O runtime recebe apenas o handle do projeto autorizado pelo gerenciador Aurora.
- A cópia 9p é limitada aos arquivos e diretórios importados do projeto; o guest não recebe acesso ao restante do dispositivo.
- A sincronização de volta é explícita/não destrutiva, preserva exclusões locais e detecta conflitos antes de sobrescrever arquivos.
- Os recursos são carregados por HTTPS. A versão npm do v86 é fixada em `0.5.473`; os assets estáticos publicados incluem checksums SHA-256 em `runtime/linux/SHA256SUMS.txt`.
- O kernel é fixado por commit e validado pelo Git blob SHA-1 antes de ser entregue ao emulador.
- O emulador roda na aba; encerrar o terminal chama o encerramento do emulador.
- Os arquivos do projeto só são gravados de volta no diretório autorizado, mediante a permissão do navegador.

## Validação

A suíte automatizada valida a versão fixada, URLs, hash do kernel, limites de memória, timeout, rejeição de esquemas inseguros, ciclo de vida, validação de caminhos e cópia/sincronização com detecção de conflitos. O deploy executa um smoke test real em Chromium headless: baixa e verifica o kernel, inicializa o Linux, monta o projeto por 9p em `/workspace`, executa comandos no guest, cria um arquivo e confirma que a sincronização o grava de volta no diretório autorizado antes de encerrar a máquina virtual.

## Licenças de terceiros

O projeto v86 é distribuído sob Simplified BSD License: https://github.com/copy/v86/blob/master/LICENSE. O espelho do kernel identifica `alizafarbati/WebLinux` como repositório de origem e `copy.sh`/`i.copy.sh` como hospedagem upstream das imagens. Preserve as licenças e atribuições aplicáveis ao kernel Linux, Buildroot, BusyBox, v86 e BIOS.
