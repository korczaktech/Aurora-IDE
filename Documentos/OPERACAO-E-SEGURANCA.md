# Aurora IDE — Operação e segurança

## Serviços

- Website: https://aurora.korczaktech.com.br/
- API: https://aurora-api-cc1d.onrender.com
- Saúde HTTP: `GET /health`
- Prontidão das dependências: `GET /ready`

## Verificações

`/health` confirma que o processo HTTP responde. Isso não comprova que o MongoDB esteja disponível.

`/ready` executa a verificação de conectividade dos bancos configurados. Resposta indisponível indica que a API não está pronta para operações que dependem de persistência.

## Dados

A autenticação utiliza a coleção compartilhada `Contas.contas` para os registros centrais. As sessões do produto ficam em `Aurora.sessoes`.

Não criar coleções adicionais na database `Contas`. A estrutura é compartilhada por outros sistemas da Korczak Technologies.

## Credenciais

- Não registrar senhas, tokens Bearer ou URI de conexão em logs.
- Não inserir segredos em arquivos versionados.
- Manter origens CORS restritas aos domínios autorizados.
- Utilizar HTTPS nos acessos públicos.
- Em caso de suspeita de exposição, rotacionar o segredo no serviço responsável.

## Terminal

O terminal cria processos Bash no servidor por meio de PTY. O processo não é executado em sandbox. O acesso administrativo é uma barreira de autorização, não um mecanismo de isolamento do sistema operacional.

Regras obrigatórias:
- manter o terminal restrito a administradores confiáveis;
- não disponibilizar sessões a contas comuns;
- não executar código de terceiros ou conteúdo não confiável;
- não armazenar dados sensíveis no diretório de trabalho;
- revisar permissões do usuário do processo e do diretório de trabalho no host.

## Limitações conhecidas

- O editor web de demonstração armazena os arquivos no navegador.
- A pré-visualização do editor não é um compilador para linguagens nativas.
- Debug Console, Problems e Ports ainda não possuem serviços operacionais conectados.
- A existência de uma aba ou controle visual não significa que exista um serviço backend correspondente.

## Operação de deploy

O backend e o frontend são componentes independentes. Alterações no código Rust exigem build e implantação do serviço de API. Alterações no website exigem publicação dos arquivos estáticos no mecanismo de hospedagem configurado.

Após uma implantação, verificar separadamente:
1. resposta HTTP do website;
2. `/health` da API;
3. `/ready` da API;
4. login e consulta da conta com uma conta de teste autorizada;
5. terminal somente com uma conta administrativa de teste, quando necessário.

Não usar dados reais de usuários em testes de rotina.
