(() => {
  const rail = document.getElementById("leftRail");
  const workspace = document.querySelector(".workspace");
  const collapseButton = document.getElementById("railToggle");
  const expandButton = document.getElementById("railReopen");
  const main = document.querySelector(".home-main");
  const projectsSidebar = document.querySelector(".projects-sidebar");
  const navItems = [...document.querySelectorAll(".rail-item[data-page]")];

  // Uma falha no armazenamento local nunca deve interromper a navegação.
  const storageGet = (key, fallback = null) => {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      console.warn("[Aurora] Leitura local indisponível:", error);
      return fallback;
    }
  };
  const storageSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("[Aurora] Gravação local indisponível:", error);
      return false;
    }
  };

  // Só a sidebar e a área principal são obrigatórias para a navegação.
  if (!rail || !main) {
    console.error("[Aurora] Elementos essenciais de navegação não encontrados.", { rail, main });
    return;
  }

  const homeMarkup = main.innerHTML;
  const defaultProject = { id: "aurora-playground", name: "Aurora Playground", description: "Ambiente experimental para explorar recursos e possibilidades da estação.", createdAt: "30 de outubro de 2026", kind: "EXPERIMENTO" };
  let projects = [];
  try { projects = JSON.parse(storageGet("aurora-projects", "[]")); } catch (_) { projects = []; }
  if (!Array.isArray(projects)) projects = [];
  projects = projects.filter(project => project && typeof project === "object");
  if (!projects.length) projects = [{ ...defaultProject }];
  let selectedProjectId = projects[0]?.id || defaultProject.id;
  const persistProjects = () => storageSet("aurora-projects", JSON.stringify(projects));
  const selectedProject = () => projects.find(project => project.id === selectedProjectId) || projects[0] || defaultProject;
  const renderProjectSidebar = () => {
    if (!projectsSidebar) return;
    const list = projectsSidebar.querySelector("#projects-sidebar-list");
    const count = projectsSidebar.querySelector(".project-count");
    if (count) count.textContent = String(projects.length).padStart(2, "0");
    if (list) list.innerHTML = projects.map(project => `<button class="project-entry" type="button" data-project-id="${escapeHTML(project.id)}" aria-label="Abrir projeto ${escapeHTML(project.name)}"><span class="project-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4z"/><path d="m8 9 4 7 4-7M8.8 14h6.4"/></svg></span><span class="project-copy"><strong>${escapeHTML(project.name)}</strong><span class="project-tag"><i></i> ${escapeHTML(project.kind || "PROJETO")}</span></span></button>`).join("");
  };
  const renderProjectList = () => {
    const list = document.getElementById("project-list");
    const count = document.getElementById("project-count");
    if (count) count.textContent = `${String(projects.length).padStart(2, "0")} ${projects.length === 1 ? "PROJETO" : "PROJETOS"}`;
    if (list) list.innerHTML = projects.map((project, index) => `<div class="project-line" data-open-project data-project-id="${escapeHTML(project.id)}" role="button" tabindex="0" aria-label="Abrir propriedades de ${escapeHTML(project.name)}"><span class="project-line-index">${String(index + 1).padStart(2, "0")}</span><div class="project-line-main"><strong>${escapeHTML(project.name)}</strong><small>${escapeHTML(project.description || "Projeto criado nesta estação")}</small></div><span class="project-line-state"><i></i>${project.id === "aurora-playground" ? "Ativo" : "Novo"}</span><span class="project-line-arrow">↗</span></div>`).join("");
  };
  persistProjects();
  const pages = {
    inicio:{title:"Início",eyebrow:"Sua estação de desenvolvimento",lead:"Um espaço para criar, explorar e transformar possibilidades em projetos.",render:()=>homeMarkup},
    projetos:{title:"Projetos",eyebrow:"ESPAÇO DE CRIAÇÃO",lead:"Cada ideia começa em algum lugar. Reúna seus experimentos e acompanhe o que está construindo.",render:()=>[
      '<div class="project-command"><div><span class="micro-label">ÁREA DE TRABALHO</span><strong>Seus projetos</strong></div><button class="action-primary" data-action="new-project">＋ Novo projeto</button></div>',
      '<section class="project-feature" data-open-project data-project-id="aurora-playground" role="button" tabindex="0" aria-label="Abrir propriedades do Aurora Playground"><div class="project-symbol">⌘</div><div class="project-feature-copy"><span class="micro-label">PROJETO EM DESTAQUE</span><h2>Aurora Playground</h2><p>Ambiente experimental para explorar recursos e possibilidades da estação.</p><div class="project-progress"><span style="width:32%"></span></div><div class="project-progress-meta"><span>Progresso do projeto</span><strong>32%</strong></div></div><div class="project-feature-status"><i></i> EM DESENVOLVIMENTO</div></section>',
      '<div class="section-heading"><span>SEUS PROJETOS</span><span id="project-count"></span></div><div class="project-table" id="project-list"></div><div class="quiet-hint">Projetos salvos neste navegador ficam disponíveis neste dispositivo. A sincronização entre dispositivos será integrada futuramente.</div>'
    ].join("")},
    propriedades:{title:"Aurora Playground",eyebrow:"PROPRIEDADES DO PROJETO",lead:"Informações, composição técnica, estrutura e preferências visuais do projeto.",render:()=>[
      '<div class="property-toolbar"><button class="property-back" type="button" data-back-projects>← Voltar para projetos</button><span class="property-status"><i></i> EXPERIMENTO · ATIVO</span></div>',
      '<section class="property-identity"><div class="property-project-mark"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3.5 43 14v20L24 44.5 5 34V14z"/><path d="m15 17 9 16 9-16M16.5 28h15"/></svg></div><div class="property-identity-copy"><span class="micro-label">PROJETO / 001</span><h2>Aurora Playground</h2><p>Ambiente experimental para explorar recursos e possibilidades da estação.</p></div><span class="property-kind">PROJETO LOCAL</span></section>',
      '<section class="property-section"><div class="section-heading"><span>IDENTIFICAÇÃO</span><span>DADOS GERAIS</span></div><div class="property-fields"><label class="property-field property-name-field">Nome<input id="project-name" value="Aurora Playground"></label><label class="property-field property-description-field">Descrição<textarea id="project-description" rows="2">Ambiente experimental para explorar recursos e possibilidades da estação.</textarea></label><div class="property-field"><span>AID · Aurora Identificator</span><strong class="property-mono">AUR-EDS-0001-PLAY</strong></div><div class="property-field"><span>Data de criação</span><strong>30 de outubro de 2026</strong></div><div class="property-field"><span>Última modificação</span><strong id="project-modified">30 de outubro de 2026 · 12:00</strong></div></div></section>',
      '<section class="property-section"><div class="section-heading"><span>COMPOSIÇÃO DO PROJETO</span><span>LINGUAGENS · 100%</span></div><div class="language-bar" role="img" aria-label="JavaScript 45%, HTML 30%, CSS 20%, Rust 5%"><span class="language-segment language-js" style="width:45%"></span><span class="language-segment language-html" style="width:30%"></span><span class="language-segment language-css" style="width:20%"></span><span class="language-segment language-rust" style="width:5%"></span></div><div class="language-legend"><div><i class="language-js"></i><span>JavaScript</span><strong>45%</strong></div><div><i class="language-html"></i><span>HTML</span><strong>30%</strong></div><div><i class="language-css"></i><span>CSS</span><strong>20%</strong></div><div><i class="language-rust"></i><span>Rust</span><strong>5%</strong></div></div><p class="property-footnote">Distribuição ilustrativa da composição do projeto nesta prévia.</p></section>',
      '<section class="property-section"><div class="section-heading"><span>TECNOLOGIAS UTILIZADAS</span><span>STACK</span></div><div class="technology-list"><span><b class="tech-js">JS</b>JavaScript</span><span><b class="tech-html">5</b>HTML5</span><span><b class="tech-css">#</b>CSS3</span><span><b class="tech-rust">R</b>Rust</span><span><b class="tech-git">⌘</b>Git</span></div></section>',
      `<section class="property-section"><div class="section-heading"><span>ESTRUTURA DE ARQUIVOS</span><span>EXPLORADOR</span></div><div class="file-explorer"><div class="file-explorer-head"><span>⌘ &nbsp; AURORA-PLAYGROUND</span><span>PRÉ-VISUALIZAÇÃO</span></div><div class="file-tree" role="tree" aria-label="Estrutura de arquivos do Aurora Playground">
<div class="tree-row tree-folder" role="treeitem" tabindex="0" aria-expanded="true" data-tree-folder="src"><span class="tree-chevron">⌄</span><svg class="tree-icon folder-icon" viewBox="0 0 20 20"><path d="M2 5.5h6l2 2h8v8.8H2z"/></svg><span>src</span></div>
<div class="tree-row tree-folder tree-child" role="treeitem" tabindex="0" aria-expanded="true" data-tree-folder="components" data-tree-parent="src"><span class="tree-chevron">⌄</span><svg class="tree-icon folder-icon" viewBox="0 0 20 20"><path d="M2 5.5h6l2 2h8v8.8H2z"/></svg><span>components</span></div>
<div class="tree-row tree-file tree-level-two" role="treeitem" aria-level="3" data-tree-parent="components"><span class="tree-spacer"></span><span class="tree-spacer"></span><svg class="tree-icon icon-js" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M10 6v7c0 2-1 2-2 1M12 12c0 2 3 2 3 0 0-1-3-1-3-3 0-2 3-2 3 0"/></svg><span>playground.js</span></div>
<div class="tree-row tree-file tree-level-two" role="treeitem" aria-level="3" data-tree-parent="components"><span class="tree-spacer"></span><span class="tree-spacer"></span><svg class="tree-icon icon-js" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M10 6v7c0 2-1 2-2 1M12 12c0 2 3 2 3 0 0-1-3-1-3-3 0-2 3-2 3 0"/></svg><span>main.js</span></div>
<div class="tree-row tree-file tree-child" role="treeitem" aria-level="2" data-tree-parent="src"><span class="tree-spacer"></span><svg class="tree-icon icon-js" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M10 6v7c0 2-1 2-2 1M12 12c0 2 3 2 3 0-1-1-3-1-3-3 0-2 3-2 3 0"/></svg><span>app.js</span></div>
<div class="tree-row tree-folder" role="treeitem" tabindex="0" aria-expanded="true" data-tree-folder="public"><span class="tree-chevron">⌄</span><svg class="tree-icon folder-icon" viewBox="0 0 20 20"><path d="M2 5.5h6l2 2h8v8.8H2z"/></svg><span>public</span></div>
<div class="tree-row tree-file tree-child" role="treeitem" aria-level="2" data-tree-parent="public"><span class="tree-spacer"></span><svg class="tree-icon icon-html" viewBox="0 0 20 20"><path d="M4 2h8l4 4v12H4z"/><path d="M12 2v4h4M7 9l-2 2 2 2m6-4 2 2-2 2m-2-5-2 6"/></svg><span>index.html</span></div>
<div class="tree-row tree-file tree-child" role="treeitem" aria-level="2" data-tree-parent="public"><span class="tree-spacer"></span><svg class="tree-icon icon-css" viewBox="0 0 20 20"><path d="M4 2h8l4 4v12H4z"/><path d="M12 2v4h4M7 9h6M7 12h5M7 15h3"/></svg><span>styles.css</span></div>
<div class="tree-row tree-folder" role="treeitem" tabindex="0" aria-expanded="true" data-tree-folder="config"><span class="tree-chevron">⌄</span><svg class="tree-icon folder-icon" viewBox="0 0 20 20"><path d="M2 5.5h6l2 2h8v8.8H2z"/></svg><span>config</span></div>
<div class="tree-row tree-file tree-child" role="treeitem" aria-level="2" data-tree-parent="config"><span class="tree-spacer"></span><svg class="tree-icon icon-json" viewBox="0 0 20 20"><path d="M4 2h8l4 4v12H4z"/><path d="M12 2v4h4M8 9c-2 0-2 2-2 2s0 2 2 2m4-4c2 0 2 2 2 2s0 2-2 2"/></svg><span>project.json</span></div>
<div class="tree-row tree-file" role="treeitem"><span class="tree-chevron"></span><svg class="tree-icon icon-rust" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="m7 6 3 3-3 3m5 0h3"/></svg><span>engine.rs</span></div>
<div class="tree-row tree-file" role="treeitem"><span class="tree-chevron"></span><svg class="tree-icon icon-doc" viewBox="0 0 20 20"><path d="M4 2h8l4 4v12H4z"/><path d="M12 2v4h4M7 10h6M7 13h6M7 16h4"/></svg><span>README.md</span></div>
`,
      '<section class="property-section"><div class="section-heading"><span>CONFIGURAÇÕES VISUAIS</span><span>AMBIENTE DO PROJETO</span></div><div class="visual-settings"><label class="visual-setting"><span><strong>Tema do projeto</strong><small>Esquema de cores utilizado no ambiente.</small></span><select id="project-theme"><option value="aurora">Aurora Boreal</option><option value="midnight">Meia-noite</option><option value="light">Claro</option></select></label><label class="visual-setting"><span><strong>Fonte do editor</strong><small>Família tipográfica da área de edição.</small></span><select id="project-font"><option>JetBrains Mono</option><option>Fira Code</option><option>Source Code Pro</option><option>Consolas</option></select></label><label class="visual-setting"><span><strong>Minimapa</strong><small>Exibir visão geral do arquivo no editor.</small></span><input class="switch" type="checkbox" checked data-project-setting="minimap"></label><label class="visual-setting"><span><strong>Quebra automática de linha</strong><small>Ajustar linhas longas à largura do editor.</small></span><input class="switch" type="checkbox" checked data-project-setting="word-wrap"></label><label class="visual-setting"><span><strong>Ícones coloridos de arquivos</strong><small>Identificar tipos de arquivo pelo ícone.</small></span><input class="switch" type="checkbox" checked data-project-setting="file-icons"></label></div><p class="property-footnote">As preferências desta tela são demonstrativas e ficam apenas nesta interface. A gravação permanente será integrada posteriormente.</p></section>',
      '<div class="property-actions"><button class="property-back" type="button" data-back-projects>← Voltar para projetos</button><button class="action-primary" type="button" data-save-project>Aplicar alterações <span>↗</span></button></div>'
    ].join("")},
    mentoria:{title:"Mentoria Korczak",eyebrow:"TECNOLOGIA PARA TODOS",lead:"Aprendizado acompanhado, projetos reais e uma oportunidade de aproximar a tecnologia de quem historicamente teve menos acesso a ela.",render:()=>[
      '<section class="mentoria-hero"><div class="mentoria-hero-copy"><span class="micro-label">MENTORIA KORCZAK · KORCZAK TECHNOLOGIES</span><h2>Seu futuro na tecnologia não deveria depender do tamanho do seu bolso.</h2><p>A Mentoria Korczak nasceu para levar conhecimento tecnológico às periferias e a pessoas que não possuem muitos recursos. Por isso, seus valores são posicionados abaixo da média do mercado, sem abrir mão de uma jornada acompanhada e construída em torno de cada aluno.</p><a class="action-primary inline-action" href="https://site.korczaktech.com.br/#/mentoria">Tenho interesse na mentoria <span>↗</span></a></div><div class="mentoria-hero-mark"><span class="mentoria-mark-orbit"></span><strong>K<span>.</span></strong><small>CONHECIMENTO QUE ABRE CAMINHOS</small></div></section>',
      '<section class="mentoria-manifesto"><span class="micro-label">NOSSA PROPOSTA</span><p>Você não precisa se encaixar em uma turma pronta. <strong>A trilha é construída com você, para o projeto que você quer aprender a desenvolver.</strong></p></section>',
      '<div class="section-heading"><span>ESCOLHA COMO QUER APRENDER</span><span>04 MODALIDADES</span></div><div class="mentoria-courses">',
      '<article class="mentoria-course"><div class="mentoria-course-top"><span class="course-index">01</span><span class="course-symbol">⌘</span></div><h3>Frontend</h3><p>Crie interfaces, páginas e experiências com as quais as pessoas interagem.</p><div class="course-levels"><span>Iniciante</span><span>Intermediário</span><span>Avançado</span></div></article>',
      '<article class="mentoria-course"><div class="mentoria-course-top"><span class="course-index">02</span><span class="course-symbol">⌁</span></div><h3>Backend</h3><p>Construa a lógica, as APIs, os serviços e a estrutura por trás das aplicações.</p><div class="course-levels"><span>Iniciante</span><span>Intermediário</span><span>Avançado</span></div></article>',
      '<article class="mentoria-course"><div class="mentoria-course-top"><span class="course-index">03</span><span class="course-symbol">◈</span></div><h3>Fullstack</h3><p>Conecte frontend e backend para desenvolver aplicações de ponta a ponta.</p><div class="course-levels"><span>Iniciante</span><span>Intermediário</span><span>Avançado</span></div></article>',
      '<article class="mentoria-course course-custom"><div class="mentoria-course-top"><span class="course-index">04</span><span class="course-symbol">✳</span></div><h3>Personalizado</h3><p>Monte seu próprio curso com conteúdos e objetivos alinhados ao projeto que deseja realizar.</p><div class="course-levels"><span>Iniciante</span><span>Intermediário</span><span>Avançado</span></div></article></div>',
      '<section class="mentoria-duration"><div><span class="micro-label">SEU TEMPO, SEU RITMO</span><h2>Escolha a duração da jornada.</h2><p>O período é definido no início, de acordo com seus objetivos e com a profundidade do projeto.</p></div><div class="duration-options"><div><strong>06</strong><span>MESES</span></div><div><strong>09</strong><span>MESES</span></div><div><strong>12</strong><span>MESES</span></div></div></section>',
      '<div class="section-heading"><span>COMO A MENTORIA FUNCIONA</span><span>DA CONVERSA AO PROJETO</span></div><div class="mentoria-process">',
      '<div class="process-step"><span>01</span><div><h3>Escolha seu caminho</h3><p>Selecione Frontend, Backend, Fullstack ou monte um curso personalizado. Escolha também o nível: Iniciante, Intermediário ou Avançado.</p></div></div>',
      '<div class="process-step"><span>02</span><div><h3>Defina o período</h3><p>Escolha entre 6, 9 ou 12 meses para desenvolver seus conhecimentos e avançar no projeto.</p></div></div>',
      '<div class="process-step"><span>03</span><div><h3>Converse com seu mentor</h3><p>Você e o mentor conversam sobre um projeto relacionado ao curso e alinham os objetivos de aprendizagem.</p></div></div>',
      '<div class="process-step"><span>04</span><div><h3>Combine sua rotina</h3><p>Juntos, vocês definem quantos dias por semana e quantas horas por dia serão dedicados aos estudos.</p></div></div>',
      '<div class="process-step"><span>05</span><div><h3>Receba sua trilha personalizada</h3><p>Com as decisões alinhadas, o mentor prepara uma trilha de estudos feita para você e para o projeto escolhido.</p></div></div></div>',
      '<section class="mentoria-certificate"><div class="certificate-emblem">K<span>.</span></div><div><span class="micro-label">AO CONCLUIR SUA JORNADA</span><h2>Seu aprendizado merece ser reconhecido.</h2><p>Você recebe um certificado físico e também um certificado digital. Ambos identificam seu nome e a duração em horas da formação. O certificado digital é assinado pelo proprietário da Korczak Technologies e pelo mentor responsável.</p></div><div class="certificate-types"><span>01 · FÍSICO</span><span>02 · DIGITAL</span></div></section>',
      '<section class="mentoria-opportunity"><div class="opportunity-heading"><span class="micro-label">UMA POSSIBILIDADE APÓS A CONCLUSÃO</span><h2>Seu projeto pode abrir uma porta para dentro da Korczak.</h2><p>A empresa <strong>pode, mas não é obrigada</strong> a apresentar duas possibilidades ao aluno após a conclusão. A existência de uma proposta depende de avaliação e decisão da empresa.</p></div><div class="opportunity-options"><article class="opportunity-option"><span class="option-number">OPÇÃO 01</span><h3>Seu projeto. Seus direitos.</h3><p>Você mantém 100% dos direitos do projeto para si. Ao escolher esse caminho, abre mão da possibilidade de ingressar na empresa por meio dessa proposta como funcionário oficial.</p><strong>100% DO PROJETO COM VOCÊ</strong></article><article class="opportunity-option opportunity-company"><span class="option-number">OPÇÃO 02</span><h3>Entre para a Korczak.</h3><p>Você cede 51% dos direitos do projeto à empresa e ingressa diretamente como <strong>Operacional Júnior</strong>, com salário, além de receber 49% dos lucros que o projeto gerar para a empresa.</p><strong>51% EMPRESA · 49% VOCÊ NOS LUCROS DO PROJETO</strong></article></div><p class="opportunity-note">Essas alternativas não são automáticas nem garantidas. A empresa decide se fará uma proposta; qualquer escolha depende de acordo formal entre as partes.</p></section>',
      '<div class="mentoria-final"><span class="micro-label">MENTORIA KORCZAK · KORCZAK TECHNOLOGIES</span><h2>Aprenda. Construa. Abra caminhos.</h2><p>Uma formação pensada para aproximar pessoas e oportunidades por meio da tecnologia.</p><a class="action-primary inline-action" href="https://site.korczaktech.com.br/#/mentoria">Conhecer e conversar sobre a mentoria <span>↗</span></a></div>'
    ].join("")},
    anotacoes:{title:"Anotações",eyebrow:"MEMÓRIA DE TRABALHO",lead:"Capture ideias, decisões e descobertas técnicas sem interromper seu fluxo de criação.",render:()=>[
      '<div class="notes-workspace"><aside class="notes-index"><div class="notes-index-head"><span class="micro-label">CADERNO</span><button class="text-action" data-action="new-note">＋ Nova nota</button></div><label class="search-field"><span>⌕</span><input id="note-search" placeholder="Buscar no caderno"></label><div class="notes-index-list" id="note-list"><div class="notes-empty">Seu caderno está vazio.<br>Crie uma nota para começar.</div></div><div class="notes-local-label"><i></i> SALVO NESTE DISPOSITIVO</div></aside>',
      '<section class="note-writing"><div class="note-writing-top"><span class="micro-label">EDITOR DE NOTAS</span><span id="note-status">NOVA ANOTAÇÃO</span></div><input class="note-title-input" id="note-title" placeholder="Título da anotação"><textarea class="note-body-input" id="note-body" placeholder="Comece a escrever...&#10;&#10;Registre uma ideia, um trecho de código, uma decisão ou qualquer referência importante."></textarea><div class="note-writing-bottom"><span>Suas notas são armazenadas localmente neste navegador.</span><button class="action-primary" data-action="save-note">Salvar anotação <span>↗</span></button></div></section></div>'
    ].join("")},
    extensoes:{title:"Extensões",eyebrow:"RECURSOS DO AMBIENTE",lead:"Explore módulos que podem ampliar o espaço de trabalho e adaptar o Aurora ao seu processo.",render:()=>[
      '<div class="extension-toolbar"><div><span class="micro-label">CATÁLOGO</span><strong>Biblioteca de extensões</strong></div><label class="search-field extension-search"><span>⌕</span><input id="extension-search" placeholder="Pesquisar no catálogo"></label></div><div class="extension-categories"><span class="category-active">Todas <b>03</b></span><span>Editor</span><span>Produtividade</span><span>Ferramentas</span></div><div class="extension-list" id="extension-list">',
      '<article class="extension-row filterable"><span class="extension-glyph">⌁</span><div class="extension-info"><span class="micro-label">EDITOR · CÓDIGO</span><h3>Code Outline</h3><p>Visualize a estrutura de funções, classes e símbolos do seu código.</p></div><span class="extension-version">v0.1 · Prévia</span><button class="text-action extension-action" data-action="extension">Adicionar <span>＋</span></button></article>',
      '<article class="extension-row filterable"><span class="extension-glyph">◈</span><div class="extension-info"><span class="micro-label">PRODUTIVIDADE · FOCO</span><h3>Focus Mode</h3><p>Reduza distrações e mantenha a atenção na tarefa em andamento.</p></div><span class="extension-version">v0.1 · Prévia</span><button class="text-action extension-action" data-action="extension">Adicionar <span>＋</span></button></article>',
      '<article class="extension-row filterable"><span class="extension-glyph">⌘</span><div class="extension-info"><span class="micro-label">FERRAMENTAS · PROJETO</span><h3>Project Explorer</h3><p>Consulte a estrutura e os recursos de um projeto em uma visão unificada.</p></div><span class="extension-version">v0.1 · Prévia</span><button class="text-action extension-action" data-action="extension">Adicionar <span>＋</span></button></article></div><p class="quiet-hint">Catálogo demonstrativo. A instalação será habilitada quando o gerenciador de extensões estiver integrado.</p>'
    ].join("")},
    repositorios:{title:"Repositórios",eyebrow:"CONTROLE DE CÓDIGO",lead:"Centralize os endereços dos seus projetos e prepare o ambiente para trabalhar com provedores Git.",render:()=>[
      '<section class="git-connect"><div class="git-connect-copy"><span class="micro-label">NOVA CONEXÃO</span><h2>Traga seu código para perto.</h2><p>Registre um repositório remoto para mantê-lo associado ao seu espaço de trabalho.</p></div><form id="repo-form" class="git-form"><label>Nome do repositório<input id="repo-name" placeholder="ex.: Aurora-IDE" required></label><label>Endereço remoto<input id="repo-url" placeholder="https://github.com/usuario/projeto.git" required></label><button class="action-primary" type="submit">Registrar repositório <span>↗</span></button></form></section>',
      '<div class="git-provider-line"><span class="micro-label">PROVEDORES</span><span class="provider-name"><b>GH</b> GitHub</span><span class="provider-name"><b>GL</b> GitLab</span><span class="provider-name"><b>BB</b> Bitbucket</span><span class="provider-pending">INTEGRAÇÕES FUTURAS</span></div><div class="section-heading"><span>REPOSITÓRIOS REGISTRADOS</span><span id="repo-count">0 CONEXÕES</span></div><div id="repo-list" class="repo-collection"><div class="repo-empty"><span class="repo-empty-mark">⌘</span><strong>Nenhum repositório por aqui.</strong><p>Registre um endereço remoto para iniciar sua lista.</p></div></div><p class="quiet-hint">O registro guarda apenas o nome e o endereço nesta sessão. Não autentica, clona nem altera repositórios remotos.</p>'
    ].join("")},
    aparencia:{title:"Aparência",eyebrow:"PERSONALIZAÇÃO DO AMBIENTE",lead:"Ajuste a atmosfera visual da estação sem perder a identidade Aurora Boreal.",render:()=>[
      '<div class="appearance-layout"><section class="appearance-preview"><div class="preview-topline"><span class="micro-label">PRÉ-VISUALIZAÇÃO</span><span class="preview-live"><i></i> TEMA ATIVO</span></div><div class="preview-scene"><div class="preview-stars"></div><div class="preview-light light-one"></div><div class="preview-light light-two"></div><div class="preview-wordmark">Aurora<span>.</span><small>EDS</small></div><div class="preview-caption">ONDE SUAS IDEIAS GANHAM FORMA.</div></div><div class="preview-theme-name"><div><strong>Aurora Boreal</strong><small>Escuro · Verde · Atmosférico</small></div><span class="theme-selected">SELECIONADO</span></div></section><section class="appearance-controls"><div class="section-heading"><span>PALETA DO AMBIENTE</span></div>',
      '<div class="palette-row"><span class="palette-swatch swatch-night"></span><div><strong>Noite profunda</strong><small>#050708 · Fundo principal</small></div><span class="palette-role">BASE</span></div><div class="palette-row"><span class="palette-swatch swatch-forest"></span><div><strong>Floresta boreal</strong><small>#174D3D · Luz ambiente</small></div><span class="palette-role">LUZ</span></div><div class="palette-row"><span class="palette-swatch swatch-mint"></span><div><strong>Verde aurora</strong><small>#82CBB0 · Destaques</small></div><span class="palette-role">ACENTO</span></div><div class="section-heading appearance-options-heading"><span>PREFERÊNCIAS</span></div>',
      '<label class="preference-line"><span><strong>Animações ambientais</strong><small>Movimento suave das luzes de fundo.</small></span><input class="switch" type="checkbox" checked data-setting="animations"></label><label class="preference-line"><span><strong>Contraste elevado</strong><small>Reforça a leitura de textos e divisórias.</small></span><input class="switch" type="checkbox" data-setting="contrast"></label><label class="preference-line"><span><strong>Interface compacta</strong><small>Reduz os espaços entre elementos.</small></span><input class="switch" type="checkbox" data-setting="compact"></label></section></div>'
    ].join("")},
    atividade:{title:"Atividade",eyebrow:"HISTÓRICO DA ESTAÇÃO",lead:"Acompanhe os eventos realmente registrados enquanto você utiliza o Aurora.",render:()=>[
      '<div class="activity-overview"><div class="activity-metric"><span class="micro-label">SESSÃO ATUAL</span><strong>01</strong><small>Esta aba do navegador</small></div><div class="activity-metric"><span class="micro-label">PROJETOS</span><strong id="activity-project-count">00</strong><small>Projetos registrados nesta estação</small></div><div class="activity-metric"><span class="micro-label">ANOTAÇÕES</span><strong id="activity-note-count">00</strong><small>Anotações disponíveis</small></div><div class="activity-metric activity-status"><span class="micro-label">ARMAZENAMENTO</span><strong id="activity-storage-state">Local</strong><small>Dados neste dispositivo ou nesta sessão</small></div></div>',
      '<div class="activity-timeline-head"><div><span class="micro-label">REGISTRO DE EVENTOS</span><h2>O que aconteceu</h2></div><div class="activity-tools"><span class="timeline-date" id="activity-event-count">00 EVENTOS</span><button class="text-action" type="button" data-action="clear-activity">Limpar histórico</button></div></div><div class="activity-timeline" id="activity-event-list" aria-live="polite"></div>'
    ].join("")},
    sobre:{title:"Sobre o Aurora",eyebrow:"IDENTIDADE DO PRODUTO",lead:"Uma estação criada para dar espaço às ideias e ferramentas para transformá-las em sistemas.",render:()=>[
      '<section class="about-hero"><div class="about-word">Aurora<span>.</span></div><div class="about-definition"><span class="micro-label">EDS · ESTAÇÃO DE DESENVOLVIMENTO DE SISTEMAS</span><h2>Um ambiente para pensar, experimentar e construir.</h2><p>O Aurora reúne a experiência de desenvolvimento em um espaço coerente, com foco em clareza, autonomia e evolução técnica.</p></div><div class="about-coordinate">KORCZAK TECHNOLOGIES<br>PRODUCT / 001</div></section>',
      '<div class="section-heading"><span>PRINCÍPIOS DE PROJETO</span><span>01 — 03</span></div><div class="principle-list"><div class="principle-line"><span>01</span><div><h3>Clareza</h3><p>Uma interface que reduz o ruído e deixa o trabalho em primeiro plano.</p></div><span class="principle-symbol">◇</span></div><div class="principle-line"><span>02</span><div><h3>Criação</h3><p>Ferramentas organizadas em torno do processo de construir.</p></div><span class="principle-symbol">⌘</span></div><div class="principle-line"><span>03</span><div><h3>Evolução</h3><p>Uma estação que cresce com os projetos e o conhecimento de quem a utiliza.</p></div><span class="principle-symbol">↗</span></div></div>',
      '<div class="about-footer"><div><span class="micro-label">DESENVOLVIDO POR</span><strong>Korczak Technologies</strong></div><div><span class="micro-label">PRODUTO</span><strong>Aurora EDS · Prévia 0.1</strong></div><div><span class="micro-label">IDENTIDADE</span><strong>Construir no próprio ritmo.</strong></div></div>'
    ].join("")},
    configuracoes:{title:"Configurações",eyebrow:"PREFERÊNCIAS DA ESTAÇÃO",lead:"Gerencie o comportamento da interface e consulte o estado dos recursos disponíveis.",render:()=>[
      '<div class="settings-layout"><nav class="settings-index"><span class="micro-label">CATEGORIAS</span><a class="settings-nav-active" href="#settings-general">Geral <span>01</span></a><a href="#settings-privacy">Conta e privacidade <span>02</span></a><a href="#settings-storage">Armazenamento <span>03</span></a></nav><div class="settings-content">',
      '<section id="settings-general" class="settings-group"><div class="section-heading"><span>GERAL</span><span>01</span></div><label class="preference-line"><span><strong>Abrir na página inicial</strong><small>Começar pela Início; desativado, retoma a última seção visitada.</small></span><input class="switch" type="checkbox" data-setting="start-home"></label><label class="preference-line"><span><strong>Confirmar ações importantes</strong><small>Pedir confirmação antes de limpar o histórico de atividade.</small></span><input class="switch" type="checkbox" data-setting="confirm"></label><label class="preference-line"><span><strong>Salvar preferências neste dispositivo</strong><small>Manter suas escolhas após fechar e reabrir o navegador.</small></span><input class="switch" type="checkbox" data-setting="local"></label></section>',
      '<section id="settings-privacy" class="settings-group"><div class="section-heading"><span>CONTA E PRIVACIDADE</span><span>02</span></div><div class="settings-info-line"><div><strong>Conta Aurora</strong><small>Autenticação e perfil ainda dependem da integração de conta.</small></div><span class="setting-state">NÃO CONECTADA</span></div><div class="settings-info-line"><div><strong>Sincronização</strong><small>Nenhum dado é enviado a um servidor nesta versão frontend.</small></div><span class="setting-state">INATIVA</span></div><div class="settings-info-line"><div><strong>Preferências locais</strong><small>Você controla se as preferências ficam salvas neste navegador.</small></div><span class="setting-state setting-local">SOB SEU CONTROLE</span></div></section>',
      '<section id="settings-storage" class="settings-group"><div class="section-heading"><span>ARMAZENAMENTO</span><span>03</span></div><div class="settings-info-line"><div><strong>Anotações</strong><small>Conteúdo mantido no armazenamento do navegador.</small></div><span class="setting-state setting-local" id="settings-notes-status">LOCAL</span></div><div class="settings-info-line"><div><strong>Projetos</strong><small>Projetos criados nesta estação.</small></div><span class="setting-state setting-local" id="settings-projects-status">LOCAL</span></div><div class="settings-info-line"><div><strong>Histórico de atividade</strong><small>Eventos recentes registrados pelo Aurora.</small></div><span class="setting-state setting-local" id="settings-activity-status">LOCAL</span></div></section></div></div>'
    ].join("")}
  };

  const setCollapsed = collapsed => {
    rail.classList.toggle("is-collapsed", collapsed);
    workspace?.classList.toggle("rail-collapsed", collapsed);
    collapseButton?.setAttribute("aria-expanded", String(!collapsed));
    expandButton?.setAttribute("aria-expanded", String(collapsed));
  };
  expandButton?.addEventListener("click", event => { event.preventDefault(); setCollapsed(false); });

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
  const notify = message => {
    const old = document.querySelector(".page-toast"); if (old) old.remove();
    const toast = document.createElement("div"); toast.className = "page-toast"; toast.textContent = message;
    document.body.appendChild(toast); window.setTimeout(() => toast.remove(), 2600);
  };

  const settingDefaults = { animations: true, contrast: false, compact: false, "start-home": true, confirm: true, local: true };
  const settingsState = { ...settingDefaults };
  Object.keys(settingDefaults).forEach(key => {
    const saved = storageGet("aurora-setting-" + key);
    if (saved !== null) settingsState[key] = saved === "true";
  });
  const getSetting = key => settingsState[key] ?? settingDefaults[key];
  const saveSetting = (key, value) => {
    settingsState[key] = Boolean(value);
    if (key === "local" || getSetting("local")) storageSet("aurora-setting-" + key, String(value));
  };
  const applyAppearance = () => {
    document.body.classList.toggle("aurora-no-motion", !getSetting("animations"));
    document.body.classList.toggle("aurora-high-contrast", getSetting("contrast"));
    document.body.classList.toggle("aurora-compact-ui", getSetting("compact"));
  };
  const hydrateSettings = () => {
    main.querySelectorAll("[data-setting]").forEach(input => { input.checked = getSetting(input.dataset.setting); });
    applyAppearance();
  };

  let activityEvents = [];
  try {
    const storedActivity = JSON.parse(storageGet("aurora-activity", "[]"));
    if (Array.isArray(storedActivity)) activityEvents = storedActivity.filter(item => item && typeof item.title === "string").slice(0, 100);
  } catch (_) { activityEvents = []; }
  const recordActivity = (title, description, kind = "SISTEMA") => {
    const event = { title, description, kind, at: new Date().toISOString() };
    activityEvents.unshift(event);
    activityEvents = activityEvents.slice(0, 100);
    if (getSetting("local")) storageSet("aurora-activity", JSON.stringify(activityEvents));
  };
  const formatActivityTime = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "AGORA";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date).toUpperCase();
  };
  const renderActivity = () => {
    const list = main.querySelector("#activity-event-list");
    if (!list) return;
    const count = main.querySelector("#activity-event-count");
    const projectMetric = main.querySelector("#activity-project-count");
    const noteMetric = main.querySelector("#activity-note-count");
    const storageMetric = main.querySelector("#activity-storage-state");
    if (count) count.textContent = String(activityEvents.length).padStart(2, "0") + " EVENTOS";
    if (projectMetric) projectMetric.textContent = String(projects.length).padStart(2, "0");
    if (noteMetric) noteMetric.textContent = String(notes.length).padStart(2, "0");
    if (storageMetric) storageMetric.textContent = getSetting("local") ? "Local" : "Sessão";
    list.innerHTML = activityEvents.length ? activityEvents.map(item => `<div class="activity-event"><span class="event-node"></span><time>${escapeHTML(formatActivityTime(item.at))}</time><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.description || "")}</p></div><span class="event-kind">${escapeHTML(item.kind || "SISTEMA")}</span></div>`).join("") : '<div class="empty-state"><strong>Nenhuma atividade registrada</strong><p>Suas ações nesta estação aparecerão aqui.</p></div>';
  };
  const refreshStorageStatus = () => {
    const notesStatus = main.querySelector("#settings-notes-status");
    const projectsStatus = main.querySelector("#settings-projects-status");
    const activityStatus = main.querySelector("#settings-activity-status");
    if (notesStatus) notesStatus.textContent = getSetting("local") ? `${notes.length} NOTA(S) · LOCAL` : `${notes.length} NOTA(S) · SESSÃO`;
    if (projectsStatus) projectsStatus.textContent = getSetting("local") ? `${projects.length} PROJETO(S) · LOCAL` : `${projects.length} PROJETO(S) · SESSÃO`;
    if (activityStatus) activityStatus.textContent = getSetting("local") ? "LOCAL" : "SESSÃO";
  };
  let notes = [];
  try { notes = JSON.parse(storageGet("aurora-notes", "[]")); } catch {}
  let repos = [];
  const renderNotes = () => {
    const list = document.getElementById("note-list"); if (!list) return;
    const query = (document.getElementById("note-search")?.value || "").toLowerCase();
    const filtered = notes.filter(note => (note.title + " " + note.body).toLowerCase().includes(query));
    list.innerHTML = filtered.length ? filtered.map((note,index) => `<button class="list-row note-open" data-note-index="${notes.indexOf(note)}" style="width:100%;text-align:left;background:none;border:0;cursor:pointer"><span class="status-dot"></span><span class="list-row-main"><strong>${escapeHTML(note.title || "Sem título")}</strong><small>${escapeHTML(note.body.slice(0,64))}</small></span></button>`).join("") : '<div class="empty-state"><strong>Nenhuma nota encontrada</strong><p>Crie uma anotação ou ajuste sua busca.</p></div>';
  };
  const renderRepos = () => {
    const list = document.getElementById("repo-list"); if (!list) return;
    list.innerHTML = repos.length ? repos.map(repo => `<div class="list-row"><span class="status-dot"></span><div class="list-row-main"><strong>${escapeHTML(repo.name)}</strong><small>${escapeHTML(repo.url)}</small></div><span class="tag">REGISTRADO</span></div>`).join("") : '<div class="empty-state"><strong>Nenhum repositório registrado</strong><p>Adicione um endereço para montar sua lista de repositórios.</p></div>';
  };
  const showPage = key => {
    const page = pages[key] || pages.inicio;
    navItems.forEach(item => item.classList.toggle("is-active", item.dataset.page === (key === "propriedades" ? "projetos" : key)));
    main.classList.toggle("app-page", key !== "inicio");
    main.classList.remove("page-propriedades");
    if (key === "propriedades") main.classList.add("page-propriedades");
    main.innerHTML = key === "inicio" ? homeMarkup : `<div class="main-atmosphere" aria-hidden="true"><span class="star star-a"></span><span class="star star-b"></span><span class="star star-c"></span><div class="aurora-ribbon ribbon-one"></div><div class="aurora-ribbon ribbon-two"></div><div class="aurora-ribbon ribbon-three"></div></div><div class="page-shell"><div class="page-eyebrow">${page.eyebrow}</div><h1 class="page-title">${page.title}</h1><p class="page-lead">${page.lead}</p>${page.render()}</div>`;
    if (projectsSidebar) projectsSidebar.hidden = key !== "inicio";
    document.title = "Aurora EDS — " + page.title;
    if (getSetting("local")) storageSet("aurora-last-page", key);
    if (key === "propriedades") {
      const project = selectedProject();
      const title = main.querySelector(".page-title");
      const identityTitle = main.querySelector(".property-identity-copy h2");
      const identityDescription = main.querySelector(".property-identity-copy p");
      const nameInput = document.getElementById("project-name");
      const descriptionInput = document.getElementById("project-description");
      if (title) title.textContent = project.name;
      if (identityTitle) identityTitle.textContent = project.name;
      if (identityDescription) identityDescription.textContent = project.description || "";
      if (nameInput) nameInput.value = project.name;
      if (descriptionInput) descriptionInput.value = project.description || "";
      const theme = document.getElementById("project-theme"); const font = document.getElementById("project-font");
      if (theme) theme.value = storageGet("aurora-project-theme", "aurora");
      if (font) font.value = storageGet("aurora-project-font", "JetBrains Mono");
      main.querySelectorAll("[data-project-setting]").forEach(input => { const saved = storageGet("aurora-project-setting-" + input.dataset.projectSetting); if (saved !== null) input.checked = saved === "true"; });
    }
    if (key === "projetos") renderProjectList();
    if (key === "anotacoes") renderNotes();
    if (key === "repositorios") renderRepos();
    if (key === "aparencia" || key === "configuracoes") hydrateSettings();
    if (key === "atividade") renderActivity();
    if (key === "configuracoes") refreshStorageStatus();
    if (key !== "atividade" && key !== "inicio") {
      recordActivity("Seção aberta: " + page.title, "Você acessou esta área do Aurora.", "NAVEGAÇÃO");
    }
    if (key === "atividade") renderActivity();
    if (key === "configuracoes") refreshStorageStatus();
    main.scrollTop = 0;
  };

  // Navegação global delegada: continua funcionando mesmo quando a sidebar
  // é reconstruída, recebe elementos internos ou muda de estado visual.
  // Roteamento delegado: o clique no botão, SVG, ícone ou texto
  // sempre é resolvido pelo botão da sidebar correspondente.
  rail.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const collapse = target?.closest("#railToggle");
    if (collapse) {
      event.preventDefault();
      setCollapsed(true);
      return;
    }

    const item = target?.closest(".rail-item[data-page]");
    if (!item || !rail.contains(item)) return;
    const destination = item.dataset.page;
    if (!Object.prototype.hasOwnProperty.call(pages, destination)) {
      console.error("[Aurora] Destino de navegação não cadastrado:", destination);
      return;
    }
    event.preventDefault();
    showPage(destination);
  }, true);

  workspace?.addEventListener("click", event => { const entry = event.target.closest(".project-entry"); if (!entry) return; selectedProjectId = entry.dataset.projectId || "aurora-playground"; showPage("propriedades"); });
  document.querySelector(".wordmark")?.addEventListener("click", event => { event.preventDefault(); showPage("inicio"); });
  main.addEventListener("click", event => {
    const folder = event.target.closest("[data-tree-folder]");
    if (folder) {
      const folderId = folder.dataset.treeFolder;
      const collapse = folder.getAttribute("aria-expanded") === "true";
      folder.setAttribute("aria-expanded", String(!collapse));
      folder.querySelector(".tree-chevron").textContent = collapse ? "›" : "⌄";
      const descendants = [...main.querySelectorAll("[data-tree-parent]")];
      const setVisibility = (parentId, hidden) => descendants.filter(row => row.dataset.treeParent === parentId).forEach(row => {
        row.hidden = hidden;
        const nestedId = row.dataset.treeFolder;
        if (nestedId) {
          if (hidden) row.setAttribute("aria-expanded", "false");
          setVisibility(nestedId, hidden || row.getAttribute("aria-expanded") !== "true");
        }
      });
      setVisibility(folderId, collapse);
      return;
    }
    const projectTrigger = event.target.closest("[data-open-project], .project-entry");
    if (projectTrigger) { selectedProjectId = projectTrigger.dataset.projectId || "aurora-playground"; showPage("propriedades"); return; }
    if (event.target.closest("[data-back-projects]")) { showPage("projetos"); return; }
    if (event.target.closest("[data-save-project]")) {
      const name = document.getElementById("project-name")?.value.trim();
      const description = document.getElementById("project-description")?.value.trim();
      if (!name) { notify("O nome do projeto não pode ficar vazio."); return; }
      const project = selectedProject();
      project.name = name;
      project.description = description || "";
      project.modifiedAt = new Date().toISOString();
      persistProjects();
      renderProjectSidebar();
      recordActivity("Projeto atualizado: " + project.name, "Nome ou descrição do projeto foram alterados.", "PROJETO");
      const modified = document.getElementById("project-modified");
      if (modified) modified.textContent = new Intl.DateTimeFormat("pt-BR",{dateStyle:"long",timeStyle:"short"}).format(new Date(project.modifiedAt));
      notify("Alterações salvas neste navegador.");
      return;
    }
    const noteButton = event.target.closest("[data-note-index]");
    if (noteButton) {
      const note = notes[Number(noteButton.dataset.noteIndex)];
      document.getElementById("note-title").value = note.title;
      document.getElementById("note-body").value = note.body;
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "new-project") {
      const name = window.prompt("Nome do novo projeto:"); if (!name?.trim()) return;
      const project = { id: "aurora-" + Date.now().toString(36), name: name.trim(), description: "Novo projeto criado no Aurora.", createdAt: new Date().toISOString(), kind: "NOVO" };
      projects.push(project);
      selectedProjectId = project.id;
      persistProjects();
      renderProjectList();
      renderProjectSidebar();
      recordActivity("Projeto criado: " + project.name, "Um novo projeto foi adicionado à estação.", "PROJETO");
      notify("Projeto criado e salvo neste navegador.");
    }
    if (action === "clear-activity") {
      if (getSetting("confirm") && !window.confirm("Deseja limpar todo o histórico de atividade deste navegador?")) return;
      activityEvents = [];
      if (getSetting("local")) storageSet("aurora-activity", "[]");
      renderActivity();
      notify("Histórico de atividade limpo.");
    }
    if (action === "new-note") { document.getElementById("note-title").value = ""; document.getElementById("note-body").value = ""; document.getElementById("note-title").focus(); }
    if (action === "save-note") {
      const title = document.getElementById("note-title").value.trim();
      const body = document.getElementById("note-body").value.trim();
      if (!title && !body) { notify("Escreva algo antes de salvar."); return; }
      notes.unshift({ title, body, updatedAt:Date.now() });
      if (getSetting("local")) storageSet("aurora-notes", JSON.stringify(notes));
      recordActivity("Anotação salva: " + (title || "Sem título"), "Uma anotação foi criada nesta estação.", "ANOTAÇÃO");
      renderNotes(); notify(getSetting("local") ? "Anotação salva neste navegador." : "Anotação disponível nesta sessão.");
    }
    if (action === "extension") {
      const button = event.target.closest("button");
      button.textContent = "Solicitada";
      button.disabled = true;
      recordActivity("Extensão solicitada", "Uma extensão foi marcada para instalação futura.", "EXTENSÃO");
      notify("Extensão marcada para instalação futura.");
    }
  });
  main.addEventListener("keydown", event => {
    if (event.target.matches("[data-tree-folder]") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if ((event.target.matches("[data-open-project]")) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); showPage("propriedades"); }
  });
  main.addEventListener("input", event => {
    if (event.target.id === "note-search") renderNotes();
    if (event.target.id === "extension-search") {
      const query = event.target.value.toLowerCase();
      document.querySelectorAll("#extension-list .filterable").forEach(card => card.hidden = !card.textContent.toLowerCase().includes(query));
    }
  });
  main.addEventListener("change", event => {
    if (event.target.matches("[data-project-setting]")) storageSet("aurora-project-setting-" + event.target.dataset.projectSetting, String(event.target.checked));
    if (event.target.id === "project-theme" || event.target.id === "project-font") storageSet("aurora-" + event.target.id, event.target.value);
    if (event.target.matches("[data-setting]")) {
      const key = event.target.dataset.setting;
      saveSetting(key, event.target.checked);
      if (key === "local" && !event.target.checked) {
        ["animations","contrast","compact","start-home","confirm"].forEach(name => { try { window.localStorage.removeItem("aurora-setting-" + name); } catch (_) {} });
      }
      if (key === "local" && event.target.checked) {
        Object.keys(settingDefaults).filter(name => name !== "local").forEach(name => storageSet("aurora-setting-" + name, String(settingsState[name])));
      }
      applyAppearance();
      recordActivity("Preferência alterada: " + key, "Uma opção da estação foi atualizada.", "PREFERÊNCIA");
      if (key === "local") {
        notify(event.target.checked ? "Preferências serão salvas neste dispositivo." : "Preferências serão mantidas somente nesta sessão.");
        refreshStorageStatus();
      }
      if (main.querySelector("#activity-event-list")) renderActivity();
    }
  });
  main.addEventListener("click", event => {
    const settingsLink = event.target.closest('.settings-index a[href^="#settings-"]');
    if (settingsLink) {
      event.preventDefault();
      const target = main.querySelector(settingsLink.getAttribute("href"));
      if (target) target.scrollIntoView({ behavior: getSetting("animations") ? "smooth" : "auto", block: "start" });
      main.querySelectorAll(".settings-index a").forEach(link => link.classList.toggle("settings-nav-active", link === settingsLink));
    }
  });
  main.addEventListener("submit", event => {
    if (event.target.id !== "repo-form") return;
    event.preventDefault();
    const name = document.getElementById("repo-name").value.trim();
    const url = document.getElementById("repo-url").value.trim();
    if (!/^https:\/\//i.test(url) && !/^git@/i.test(url)) { notify("Informe uma URL HTTPS ou SSH válida."); return; }
    repos.push({ name, url }); renderRepos();
    recordActivity("Repositório registrado: " + name, "Um endereço de repositório foi adicionado à sessão.", "REPOSITÓRIO");
    event.target.reset(); notify("Endereço registrado nesta sessão.");
  });
  renderProjectSidebar();
  recordActivity("Ambiente Aurora aberto", "A estação foi iniciada neste navegador.", "SISTEMA");
  const rememberedPage = storageGet("aurora-last-page", "inicio");
  const initialPage = getSetting("start-home") ? "inicio" : (Object.prototype.hasOwnProperty.call(pages, rememberedPage) ? rememberedPage : "inicio");
  showPage(initialPage);
  window.addEventListener("beforeunload", () => {
    if (getSetting("local")) storageSet("aurora-last-page", document.querySelector(".rail-item.is-active")?.dataset.page || "inicio");
  });
})();