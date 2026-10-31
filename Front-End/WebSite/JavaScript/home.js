(() => {
  const rail = document.getElementById("leftRail");
  const workspace = document.querySelector(".workspace");
  const collapseButton = document.getElementById("railToggle");
  const expandButton = document.getElementById("railReopen");
  const main = document.querySelector(".home-main");
  const projectsSidebar = document.querySelector(".projects-sidebar");
  const navItems = [...document.querySelectorAll(".rail-item[data-page]")];
  if (!rail || !workspace || !collapseButton || !expandButton || !main) return;

  const homeMarkup = main.innerHTML;
  const pages = {
    inicio:{title:"Início",eyebrow:"Sua estação de desenvolvimento",lead:"Um espaço para criar, explorar e transformar possibilidades em projetos.",render:()=>homeMarkup},
    projetos:{title:"Projetos",eyebrow:"ESPAÇO DE CRIAÇÃO",lead:"Cada ideia começa em algum lugar. Reúna seus experimentos e acompanhe o que está construindo.",render:()=>[
      '<div class="project-command"><div><span class="micro-label">ÁREA DE TRABALHO</span><strong>Seus projetos</strong></div><button class="action-primary" data-action="new-project">＋ Novo projeto</button></div>',
      '<section class="project-feature"><div class="project-symbol">⌘</div><div class="project-feature-copy"><span class="micro-label">EXPERIMENTO · 001</span><h2>Aurora Playground</h2><p>Ambiente experimental para explorar recursos e possibilidades da estação.</p><div class="project-progress"><span style="width:32%"></span></div><div class="project-progress-meta"><span>Progresso do projeto</span><strong>32%</strong></div></div><div class="project-feature-status"><i></i> EM DESENVOLVIMENTO</div></section>',
      '<div class="section-heading"><span>SEUS PROJETOS</span><span id="project-count">01 PROJETO</span></div><div class="project-table" id="project-list"><div class="project-line"><span class="project-line-index">01</span><div class="project-line-main"><strong>Aurora Playground</strong><small>Experimento inicial · Criado para explorar a estação</small></div><span class="project-line-state"><i></i>Ativo</span><span class="project-line-arrow">↗</span></div></div><div class="quiet-hint">Projetos criados nesta prévia permanecem disponíveis apenas durante a sessão atual.</div>'
    ].join("")},
    mentoria:{title:"Mentoria",eyebrow:"APRENDIZADO E EVOLUÇÃO",lead:"Desenvolva autonomia técnica. Avance dos fundamentos até a construção de sistemas completos.",render:()=>[
      '<section class="mentoria-intro"><div class="mentoria-copy"><span class="micro-label">SUA JORNADA COMEÇA AQUI</span><h2>Aprender a programar é aprender a construir.</h2><p>Uma trilha progressiva para transformar curiosidade em conhecimento prático e conhecimento em projetos reais.</p><a class="action-primary inline-action" href="https://site.korczaktech.com.br/#/mentoria">Conhecer a mentoria <span>↗</span></a></div><div class="mentoria-orbit" aria-hidden="true"><span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="orbit-core">A<span>.</span></span></div></section>',
      '<div class="section-heading"><span>TRILHA DE DESENVOLVIMENTO</span><span>04 ETAPAS</span></div><div class="learning-path">',
      '<div class="learning-step"><span class="learning-number">01</span><div><span class="micro-label">FUNDAMENTO</span><h3>Lógica de programação</h3><p>Raciocínio computacional, algoritmos e resolução estruturada de problemas.</p></div><span class="learning-state">PONTO DE PARTIDA</span></div>',
      '<div class="learning-step"><span class="learning-number">02</span><div><span class="micro-label">CONHECIMENTO</span><h3>Linguagens e estruturas</h3><p>Dados, sintaxe, controle de fluxo, funções e boas práticas.</p></div><span class="learning-state">ETAPA 02</span></div>',
      '<div class="learning-step"><span class="learning-number">03</span><div><span class="micro-label">APLICAÇÃO</span><h3>Projetos e ferramentas</h3><p>Aplicar fundamentos em experiências, aplicações e sistemas.</p></div><span class="learning-state">ETAPA 03</span></div>',
      '<div class="learning-step"><span class="learning-number">04</span><div><span class="micro-label">AUTONOMIA</span><h3>Engenharia de sistemas</h3><p>Arquitetura, decisões técnicas, qualidade e evolução contínua.</p></div><span class="learning-state">ETAPA 04</span></div></div>'
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
    atividade:{title:"Atividade",eyebrow:"HISTÓRICO DA ESTAÇÃO",lead:"Acompanhe os eventos registrados nesta experiência do Aurora.",render:()=>[
      '<div class="activity-overview"><div class="activity-metric"><span class="micro-label">SESSÃO ATUAL</span><strong>01</strong><small>Ambiente em execução</small></div><div class="activity-metric"><span class="micro-label">PROJETOS VISÍVEIS</span><strong>01</strong><small>Aurora Playground</small></div><div class="activity-metric"><span class="micro-label">ARMAZENAMENTO</span><strong class="metric-word">Local</strong><small>Sem sincronização em nuvem</small></div><div class="activity-metric activity-status"><span class="micro-label">ESTADO DO AMBIENTE</span><strong><i></i> Operacional</strong><small>Interface carregada neste navegador</small></div></div>',
      '<div class="activity-timeline-head"><div><span class="micro-label">REGISTRO DE EVENTOS</span><h2>O que aconteceu</h2></div><span class="timeline-date">SESSÃO ATUAL</span></div><div class="activity-timeline"><div class="activity-event"><span class="event-node"></span><time>AGORA</time><div><strong>Ambiente Aurora aberto</strong><p>A estação foi iniciada neste navegador.</p></div><span class="event-kind">SISTEMA</span></div><div class="activity-event"><span class="event-node"></span><time>INÍCIO</time><div><strong>Aurora Playground disponível</strong><p>Projeto experimental carregado na área de trabalho.</p></div><span class="event-kind">PROJETO</span></div><div class="activity-event"><span class="event-node"></span><time>INÍCIO</time><div><strong>Interface preparada</strong><p>Navegação e ambiente visual inicializados.</p></div><span class="event-kind">SISTEMA</span></div></div>'
    ].join("")},
    sobre:{title:"Sobre o Aurora",eyebrow:"IDENTIDADE DO PRODUTO",lead:"Uma estação criada para dar espaço às ideias e ferramentas para transformá-las em sistemas.",render:()=>[
      '<section class="about-hero"><div class="about-word">Aurora<span>.</span></div><div class="about-definition"><span class="micro-label">EDS · ESTAÇÃO DE DESENVOLVIMENTO DE SISTEMAS</span><h2>Um ambiente para pensar, experimentar e construir.</h2><p>O Aurora reúne a experiência de desenvolvimento em um espaço coerente, com foco em clareza, autonomia e evolução técnica.</p></div><div class="about-coordinate">KORCZAK TECHNOLOGIES<br>PRODUCT / 001</div></section>',
      '<div class="section-heading"><span>PRINCÍPIOS DE PROJETO</span><span>01 — 03</span></div><div class="principle-list"><div class="principle-line"><span>01</span><div><h3>Clareza</h3><p>Uma interface que reduz o ruído e deixa o trabalho em primeiro plano.</p></div><span class="principle-symbol">◇</span></div><div class="principle-line"><span>02</span><div><h3>Criação</h3><p>Ferramentas organizadas em torno do processo de construir.</p></div><span class="principle-symbol">⌘</span></div><div class="principle-line"><span>03</span><div><h3>Evolução</h3><p>Uma estação que cresce com os projetos e o conhecimento de quem a utiliza.</p></div><span class="principle-symbol">↗</span></div></div>',
      '<div class="about-footer"><div><span class="micro-label">DESENVOLVIDO POR</span><strong>Korczak Technologies</strong></div><div><span class="micro-label">PRODUTO</span><strong>Aurora EDS · Prévia 0.1</strong></div><div><span class="micro-label">IDENTIDADE</span><strong>Construir no próprio ritmo.</strong></div></div>'
    ].join("")},
    configuracoes:{title:"Configurações",eyebrow:"PREFERÊNCIAS DA ESTAÇÃO",lead:"Gerencie o comportamento da interface e consulte o estado dos recursos disponíveis.",render:()=>[
      '<div class="settings-layout"><nav class="settings-index"><span class="micro-label">CATEGORIAS</span><a class="settings-nav-active" href="#settings-general">Geral <span>01</span></a><a href="#settings-privacy">Conta e privacidade <span>02</span></a><a href="#settings-storage">Armazenamento <span>03</span></a></nav><div class="settings-content">',
      '<section id="settings-general" class="settings-group"><div class="section-heading"><span>GERAL</span><span>01</span></div><label class="preference-line"><span><strong>Abrir na página inicial</strong><small>Iniciar o Aurora na seção Início.</small></span><input class="switch" type="checkbox" checked data-setting="start-home"></label><label class="preference-line"><span><strong>Confirmar ações importantes</strong><small>Solicitar confirmação antes de ações destrutivas.</small></span><input class="switch" type="checkbox" checked data-setting="confirm"></label><label class="preference-line"><span><strong>Salvar preferências neste dispositivo</strong><small>Manter suas escolhas neste navegador.</small></span><input class="switch" type="checkbox" checked data-setting="local"></label></section>',
      '<section id="settings-privacy" class="settings-group"><div class="section-heading"><span>CONTA E PRIVACIDADE</span><span>02</span></div><div class="settings-info-line"><div><strong>Conta Aurora</strong><small>Autenticação ainda não está disponível nesta prévia.</small></div><span class="setting-state">NÃO CONECTADA</span></div><div class="settings-info-line"><div><strong>Sincronização</strong><small>Seus dados não estão sendo enviados para um servidor.</small></div><span class="setting-state">INATIVA</span></div></section>',
      '<section id="settings-storage" class="settings-group"><div class="section-heading"><span>ARMAZENAMENTO</span><span>03</span></div><div class="settings-info-line"><div><strong>Anotações</strong><small>Salvas no armazenamento local do navegador.</small></div><span class="setting-state setting-local">LOCAL</span></div><div class="settings-info-line"><div><strong>Repositórios</strong><small>Endereços mantidos durante a sessão atual.</small></div><span class="setting-state setting-local">SESSÃO</span></div></section></div></div>'
    ].join("")}
  };

  const setCollapsed = collapsed => {
    rail.classList.toggle("is-collapsed", collapsed);
    workspace.classList.toggle("rail-collapsed", collapsed);
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    expandButton.setAttribute("aria-expanded", String(collapsed));
  };
  collapseButton.addEventListener("click", () => setCollapsed(true));
  expandButton.addEventListener("click", () => setCollapsed(false));

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
  const notify = message => {
    const old = document.querySelector(".page-toast"); if (old) old.remove();
    const toast = document.createElement("div"); toast.className = "page-toast"; toast.textContent = message;
    document.body.appendChild(toast); window.setTimeout(() => toast.remove(), 2600);
  };
  let notes = [];
  try { notes = JSON.parse(localStorage.getItem("aurora-notes") || "[]"); } catch {}
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
    navItems.forEach(item => item.classList.toggle("is-active", item.dataset.page === key));
    main.classList.toggle("app-page", key !== "inicio");
    main.innerHTML = key === "inicio" ? homeMarkup : `<div class="main-atmosphere" aria-hidden="true"><span class="star star-a"></span><span class="star star-b"></span><span class="star star-c"></span><div class="aurora-ribbon ribbon-one"></div><div class="aurora-ribbon ribbon-two"></div><div class="aurora-ribbon ribbon-three"></div></div><div class="page-shell"><div class="page-eyebrow">${page.eyebrow}</div><h1 class="page-title">${page.title}</h1><p class="page-lead">${page.lead}</p>${page.render()}</div>`;
    if (projectsSidebar) projectsSidebar.hidden = key !== "inicio";
    document.title = "Aurora EDS — " + page.title;
    if (key === "anotacoes") renderNotes();
    if (key === "repositorios") renderRepos();
    main.scrollTop = 0;
  };
  navItems.forEach(item => item.addEventListener("click", () => showPage(item.dataset.page)));
  document.querySelector(".wordmark")?.addEventListener("click", event => { event.preventDefault(); showPage("inicio"); });
  main.addEventListener("click", event => {
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
      const list = document.getElementById("project-list");
      if (list) list.insertAdjacentHTML("beforeend", `<div class="list-row"><span class="status-dot"></span><div class="list-row-main"><strong>${escapeHTML(name.trim())}</strong><small>Novo projeto · Criado nesta sessão</small></div><span class="tag">NOVO</span></div>`);
      notify("Projeto adicionado à visualização.");
    }
    if (action === "new-note") { document.getElementById("note-title").value = ""; document.getElementById("note-body").value = ""; document.getElementById("note-title").focus(); }
    if (action === "save-note") {
      const title = document.getElementById("note-title").value.trim();
      const body = document.getElementById("note-body").value.trim();
      if (!title && !body) { notify("Escreva algo antes de salvar."); return; }
      notes.unshift({ title, body, updatedAt:Date.now() });
      localStorage.setItem("aurora-notes", JSON.stringify(notes));
      renderNotes(); notify("Anotação salva neste navegador.");
    }
    if (action === "extension") { event.target.closest("button").textContent = "Solicitada"; event.target.closest("button").disabled = true; notify("Extensão marcada para instalação futura."); }
  });
  main.addEventListener("input", event => {
    if (event.target.id === "note-search") renderNotes();
    if (event.target.id === "extension-search") {
      const query = event.target.value.toLowerCase();
      document.querySelectorAll("#extension-list .filterable").forEach(card => card.hidden = !card.textContent.toLowerCase().includes(query));
    }
  });
  main.addEventListener("change", event => {
    if (event.target.matches("[data-setting]")) localStorage.setItem("aurora-setting-" + event.target.dataset.setting, String(event.target.checked));
  });
  main.addEventListener("submit", event => {
    if (event.target.id !== "repo-form") return;
    event.preventDefault();
    const name = document.getElementById("repo-name").value.trim();
    const url = document.getElementById("repo-url").value.trim();
    if (!/^https:\/\//i.test(url) && !/^git@/i.test(url)) { notify("Informe uma URL HTTPS ou SSH válida."); return; }
    repos.push({ name, url }); renderRepos(); event.target.reset(); notify("Endereço registrado nesta sessão.");
  });
  showPage("inicio");
})();