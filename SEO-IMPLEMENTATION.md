# Implementação de SEO — Aurora EDS

## Domínio canônico adotado

https://korczaktech.github.io/Aurora-IDE/

Este é o endereço atual do GitHub Pages e foi usado nos canonical links, sitemap e dados estruturados. Se a Aurora migrar para um domínio próprio, todos esses endereços deverão ser atualizados em conjunto.

## Implementado no repositório

- Metadados title, description, canonical, idioma e robots.
- Open Graph e Twitter Cards.
- Dados estruturados JSON-LD para Organization, SoftwareApplication, WebSite e páginas públicas.
- Sitemap XML com somente URLs públicas indexáveis.
- robots.txt publicado dentro do artefato do projeto.
- llms.txt e llms-full.txt com informações factuais e limitações da versão 0.0.1.
- humans.txt, favicon SVG e web manifest.
- Página Sobre e página Recursos com conteúdo HTML rastreável.
- Página 404 personalizada.
- noindex para editor experimental, login e cadastro.
- Validação automatizada desses arquivos no GitHub Actions.

## Etapas externas que exigem acesso do proprietário

1. Abrir Google Search Console e adicionar a propriedade de prefixo de URL https://korczaktech.github.io/Aurora-IDE/.
2. Escolher a verificação por arquivo HTML, baixar o arquivo fornecido pelo Google e colocá-lo na raiz publicada do projeto. O token não deve ser inventado; a validação só pode ser concluída com o arquivo real emitido pelo Google.
3. Após a publicação, confirmar a propriedade no Search Console.
4. Enviar https://korczaktech.github.io/Aurora-IDE/sitemap.xml.
5. Inspecionar a página inicial, Sobre e Recursos e solicitar indexação.
6. Acompanhar cobertura, experiência da página, Core Web Vitals e desempenho.

## Limitações específicas do GitHub Pages

O endereço atual é um site de projeto, publicado em um caminho (/Aurora-IDE/) dentro do host korczaktech.github.io. O Google exige que robots.txt esteja na raiz do host, e não em um subdiretório. Portanto, o arquivo publicado como /Aurora-IDE/robots.txt não controla o host korczaktech.github.io. Para ter um robots.txt válido e exclusivo da Aurora, será necessário publicar a Aurora em um domínio/subdomínio próprio, ou administrar com cuidado o robots.txt do host principal sem afetar outros projetos.

O sitemap pode ser enviado diretamente pelo Search Console, independentemente de o robots.txt estar disponível na raiz.

## Contatos de segurança

Um security.txt dedicado não foi criado porque ainda não foi fornecido um endereço ou canal específico para relatos de vulnerabilidades. Não foi inventado um contato de segurança.

## Imagem de compartilhamento

A imagem social atual é um SVG vetorial de 1200 × 630. Alguns serviços de compartilhamento dão preferência a PNG ou JPEG; caso uma plataforma não apresente a prévia, substituir o arquivo por PNG/JPEG e atualizar os metadados og:image e twitter:image.

## Observações

- llms.txt é um arquivo complementar de contexto para agentes compatíveis; não substitui sitemap, robots.txt ou conteúdo HTML e não garante melhor posicionamento no Google.
- O envio de sitemap e pedidos de indexação não garantem inclusão no índice ou posição específica.
- Não há Analytics/GA4 configurado porque nenhum Measurement ID foi fornecido.
