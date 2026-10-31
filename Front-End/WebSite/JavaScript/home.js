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
    inicio: { title:"Início", eyebrow:"Sua estação de desenvolvimento", lead:"Um espaço para criar, explorar e transformar possibilidades em projetos.", render:() => homeMarkup },
    projetos: { title:"Projetos", eyebrow:"Seu espaço de criação", lead:"Organize ideias, acompanhe experimentos e mantenha seus trabalhos em movimento.", render:() => `
      <div class="page-toolbar"><h2>Visão geral</h2><button class="page-action" data-action="new-project">＋ Novo projeto</button></div>
      <div class="page-grid">
        <article class="page-section"><span class="page-section-icon">⌘</span><span class="meta-label">EXPERIMENTO · 001</span><h3>Aurora Playground</h3><p>Ambiente experimental para explorar recursos e possibilidades da estação.</p><div class="progress-track"><span style="width:32%"></span></div><div class="list-row"><div class="list-row-main"><small>Progresso do projeto</small></div><span class="tag">EM DESENVOLVIMENTO</span></div></article>
        <article class="page-section"><span class="page-section-icon">＋</span><h3>Comece algo novo</h3><p>Crie um espaço para uma nova ideia, protótipo ou sistema.</p><button class="page-button" data-action="new-project" style="margin-top:18px">Criar projeto</button></article>
        <article class="page-section"><span class="page-section-icon">◷</span><h3>Organização</h3><p>Seus projetos ficam reunidos aqui para facilitar o acompanhamento.</p><span class="tag" style="margin-top:17px">ÁREA DE TRABALHO</span></article>
      </div><div class="page-toolbar"><h2>Seus projetos</h2><span class="meta-label">01 ITEM</span></div><div class="page-section" id="project-list"><div class="list-row"><span class="status-dot"></span><div class="list-row-main"><strong>Aurora Playground</strong><small>Experimento · Projeto inicial</small></div><span class="tag">ATIVO</span></div></div>` },
    mentoria: { title:"Mentoria", eyebrow:"Aprenda construindo", lead:"Uma trilha para desenvolver pensamento lógico, domínio técnico e autonomia na criação de sistemas.", render:() => `
      <div class="page-grid two" style="margin-top:30px">
        <article class="page-section"><span class="meta-label">TRILHA DE APRENDIZADO</span><h3 style="font-size:18px;margin-top:12px">Do primeiro código ao seu primeiro sistema.</h3><p>Aprenda fundamentos, pratique com projetos reais e evolua no seu próprio ritmo.</p><a class="page-button" href="https://site.korczaktech.com.br/#/mentoria" style="margin-top:22px">Conhecer a mentoria ↗</a></article>
        <article class="page-section"><span class="meta-label">SEU PONTO DE PARTIDA</span><div class="list-row"><span class="step-number">01</span><div class="list-row-main"><strong>Lógica de programação</strong><small>Raciocínio, algoritmos e resolução de problemas.</small></div></div><div class="list-row"><span class="step-number">02</span><div class="list-row-main"><strong>Fundamentos da linguagem</strong><small>Estruturas, dados e boas práticas.</small></div></div><div class="list-row"><span class="step-number">03</span><div class="list-row-main"><strong>Construção de projetos</strong><small>Transforme conhecimento em aplicações.</small></div></div></article>
      </div><div class="page-toolbar"><h2>Princípios da jornada</h2></div><div class="page-grid"><article class="page-section"><h3>Prática contínua</h3><p>Aprender fazendo, testando e melhorando.</p></article><article class="page-section"><h3>Fundamentos sólidos</h3><p>Entender o porquê antes de apenas copiar.</p></article><article class="page-section"><h3>Autonomia</h3><p>Desenvolver capacidade de investigar e decidir.</p></article></div>` },
    anotacoes: { title:"Anotações", eyebrow:"Ideias em construção", lead:"Registre raciocínios, decisões técnicas e referências em um espaço simples e organizado.", render:() => `
      <div class="note-layout"><section class="page-section"><div class="page-toolbar" style="margin:0 0 12px"><h2>Minhas notas</h2><button class="page-button" data-action="new-note">＋ Nova</button></div><input class="page-input" id="note-search" placeholder="Buscar anotações..."><div class="note-list" id="note-list" style="margin-top:12px"><div class="empty-state"><strong>Nenhuma anotação ainda</strong><p>Crie sua primeira nota para começar a organizar suas ideias.</p></div></div></section><section class="page-section note-editor"><span class="meta-label">EDITOR DE ANOTAÇÃO</span><input class="page-input" id="note-title" placeholder="Título da anotação"><textarea class="page-textarea" id="note-body" placeholder="Escreva uma ideia, observação ou decisão técnica..."></textarea><div class="color-options" aria-label="Cor da anotação"><button class="color-chip" aria-label="Verde"></button><button class="color-chip" aria-label="Azul"></button><button class="color-chip" aria-label="Âmbar"></button><button class="color-chip" aria-label="Roxo"></button></div><div style="display:flex;justify-content:flex-end"><button class="page-action" data-action="save-note">Salvar anotação</button></div><p class="muted" id="note-feedback" aria-live="polite">As notas ficam salvas neste navegador.</p></section></div>` },
    extensoes: { title:"Extensões", eyebrow:"Amplie seu ambiente", lead:"Conheça módulos que podem complementar o fluxo de desenvolvimento do Aurora.", render:() => `
      <div class="page-toolbar"><h2>Biblioteca de extensões</h2><input class="page-input page-search" id="extension-search" placeholder="Pesquisar extensões..."></div>
      <div class="page-grid" id="extension-list">
        <article class="page-section filterable"><span class="page-section-icon">⌁</span><span class="meta-label">EDITOR</span><h3>Code Outline</h3><p>Visualização estrutural de funções, classes e símbolos do código.</p><button class="page-button secondary" data-action="extension" style="margin-top:17px">Adicionar</button></article>
        <article class="page-section filterable"><span class="page-section-icon">◈</span><span class="meta-label">PRODUTIVIDADE</span><h3>Focus Mode</h3><p>Reduza distrações e mantenha o foco na tarefa atual.</p><button class="page-button secondary" data-action="extension" style="margin-top:17px">Adicionar</button></article>
        <article class="page-section filterable"><span class="page-section-icon">⌘</span><span class="meta-label">FERRAMENTAS</span><h3>Project Explorer</h3><p>Uma visão compacta da estrutura e dos recursos do projeto.</p><button class="page-button secondary" data-action="extension" style="margin-top:17px">Adicionar</button></article>
      </div><div class="page-notice">A biblioteca apresenta a interface inicial. A instalação real de extensões será ativada quando o gerenciador de extensões estiver integrado.</div>` },
    repositorios: { title:"Repositórios", eyebrow:"Código sob seu controle", lead:"Reúna os endereços dos repositórios que fazem parte dos seus projetos.", render:() => `
      <div class="page-grid two" style="margin-top:30px"><section class="page-section"><span class="meta-label">ADICIONAR REPOSITÓRIO</span><h3 style="margin-top:12px">Vincule um endereço Git</h3><p>Informe a URL HTTPS ou SSH do repositório para registrá-lo nesta área.</p><form id="repo-form" style="margin-top:19px;display:grid;gap:10px"><input class="page-input" id="repo-name" placeholder="Nome do repositório" required><input class="page-input" id="repo-url" placeholder="https://github.com/usuario/projeto.git" required><button class="page-action" type="submit">＋ Registrar endereço</button></form></section><section class="page-section"><span class="meta-label">INTEGRAÇÃO</span><h3 style="margin-top:12px">Conexões Git</h3><p>Esta área está preparada para receber a integração com provedores Git. Nenhuma conta externa está conectada neste momento.</p><div class="page-notice">Registrar um endereço aqui não concede acesso ao repositório nem executa operações Git.</div></section></div><div class="page-toolbar"><h2>Repositórios registrados</h2></div><div class="page-section" id="repo-list"><div class="empty-state"><strong>Nenhum repositório registrado</strong><p>Adicione um endereço para montar sua lista de repositórios.</p></div></div>` },
    aparencia: { title:"Aparência", eyebrow:"Seu ambiente, sua identidade", lead:"Ajustes visuais para manter o Aurora confortável e consistente durante o desenvolvimento.", render:() => `
      <div class="page-grid two" style="margin-top:30px"><section class="page-section"><span class="meta-label">TEMA ATUAL</span><h3 style="margin-top:12px">Aurora Boreal</h3><p>Fundo profundo, iluminação verde sutil e detalhes azul-esverdeados.</p><div style="height:105px;margin-top:18px;border:1px solid #315344;border-radius:5px;background:radial-gradient(ellipse at 48% 30%,rgba(52,143,91,.42),transparent 48%),linear-gradient(135deg,#07100e,#050708)"></div><span class="tag" style="margin-top:14px">ATIVO</span></section><section class="page-section"><span class="meta-label">PREFERÊNCIAS DE INTERFACE</span><div class="switch-row"><div><strong>Animações ambientais</strong><small>Movimento suave das luzes de fundo.</small></div><input class="switch" type="checkbox" checked data-setting="animations"></div><div class="switch-row"><div><strong>Contraste elevado</strong><small>Reforça bordas e separações.</small></div><input class="switch" type="checkbox" data-setting="contrast"></div><div class="switch-row"><div><strong>Interface compacta</strong><small>Reduz espaços entre elementos.</small></div><input class="switch" type="checkbox" data-setting="compact"></div></section></div><div class="page-notice">A identidade visual principal do Aurora permanece preservada. Estas opções são preferências locais de interface.</div>` },
    atividade: { title:"Atividade", eyebrow:"Acompanhe sua jornada", lead:"Uma visão cronológica das ações realizadas no ambiente Aurora.", render:() => `
      <div class="page-grid" style="margin-top:30px"><article class="page-section"><span class="meta-label">SESSÃO ATUAL</span><strong class="stat-value">01</strong><p>Ambiente em execução neste navegador.</p></article><article class="page-section"><span class="meta-label">PROJETOS</span><strong class="stat-value">01</strong><p>Projeto de demonstração disponível.</p></article><article class="page-section"><span class="meta-label">SINCRONIZAÇÃO</span><strong class="stat-value" style="font-size:19px">Local</strong><p>Sem conexão com conta ou nuvem.</p></article></div><div class="page-toolbar"><h2>Linha do tempo</h2><span class="tag">SESSÃO LOCAL</span></div><div class="page-section"><div class="timeline"><div class="timeline-item"><strong>Ambiente Aurora aberto</strong><small>Esta sessão · Navegação iniciada</small></div><div class="timeline-item"><strong>Aurora Playground disponível</strong><small>Projeto de demonstração</small></div><div class="timeline-item"><strong>Estação preparada</strong><small>Interface inicial carregada</small></div></div></div>` },
    sobre: { title:"Sobre o Aurora", eyebrow:"Uma estação para construir", lead:"O Aurora é uma Estação de Desenvolvimento de Sistemas criada para reunir ferramentas, conhecimento e projetos em um ambiente coerente.", render:() => `
      <section class="page-section" style="margin-top:30px;display:flex;align-items:center;gap:28px;flex-wrap:wrap"><div class="about-mark">Aurora<span>.</span></div><div style="flex:1;min-width:220px"><span class="meta-label">ESTAÇÃO DE DESENVOLVIMENTO DE SISTEMAS</span><h3 style="font-size:18px;margin-top:10px">Ideias ganham forma quando encontram espaço para evoluir.</h3><p>Um ambiente pensado para apoiar o processo de desenvolvimento, da exploração inicial à construção de sistemas.</p></div></section><div class="page-grid" style="margin-top:14px"><article class="page-section"><span class="page-section-icon">◇</span><h3>Clareza</h3><p>Uma interface organizada para reduzir ruído e facilitar o trabalho.</p></article><article class="page-section"><span class="page-section-icon">⌘</span><h3>Criação</h3><p>Ferramentas reunidas em torno do processo de construir.</p></article><article class="page-section"><span class="page-section-icon">↗</span><h3>Evolução</h3><p>Uma estação que cresce junto com seus projetos e conhecimentos.</p></article></div><div class="page-toolbar"><h2>Informações</h2></div><div class="page-section"><div class="list-row"><div class="list-row-main"><strong>Produto</strong><small>Aurora EDS — Estação de Desenvolvimento de Sistemas</small></div></div><div class="list-row"><div class="list-row-main"><strong>Desenvolvimento</strong><small>Korczak Technologies</small></div></div><div class="list-row"><div class="list-row-main"><strong>Versão da interface</strong><small>Prévia inicial · 0.1</small></div></div></div>` },
    configuracoes: { title:"Configurações", eyebrow:"Controle do ambiente", lead:"Preferências gerais para organizar sua experiência dentro do Aurora.", render:() => `
      <div class="page-grid two" style="margin-top:30px"><section class="page-section"><span class="meta-label">GERAL</span><div class="switch-row"><div><strong>Abrir na página inicial</strong><small>Iniciar o Aurora na seção Início.</small></div><input class="switch" type="checkbox" checked data-setting="start-home"></div><div class="switch-row"><div><strong>Confirmar ações importantes</strong><small>Exibir confirmação antes de ações destrutivas.</small></div><input class="switch" type="checkbox" checked data-setting="confirm"></div><div class="switch-row"><div><strong>Salvar preferências neste dispositivo</strong><small>Manter opções neste navegador.</small></div><input class="switch" type="checkbox" checked data-setting="local"></div></section><section class="page-section"><span class="meta-label">CONTA E PRIVACIDADE</span><h3 style="margin-top:12px">Sua conta Aurora</h3><p>O acesso, a sincronização e as opções de privacidade serão habilitados com a implementação do sistema de contas.</p><div class="page-notice">Você está usando a interface sem autenticação. Nenhuma informação foi enviada para um servidor.</div></section></div><div class="page-toolbar"><h2>Ambiente</h2></div><section class="page-section"><div class="list-row"><div class="list-row-main"><strong>Estação de trabalho</strong><small>Interface web do Aurora</small></div><span class="tag">ATIVA</span></div><div class="list-row"><div class="list-row-main"><strong>Armazenamento</strong><small>Preferências e anotações locais deste navegador</small></div><span class="tag">LOCAL</span></div></section>` }
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