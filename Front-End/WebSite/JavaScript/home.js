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

  let createProjectForEditor = false;
  const editorUrlFor = project => "editor.html?project=" + encodeURIComponent(project.name);
  const openProjectInEditor = project => {
    if (!project?.name) return;
    window.location.href = editorUrlFor(project);
  };
  const projectPicker = document.getElementById("auroraProjectPicker");
  const renderProjectPicker = () => {
    const list = document.getElementById("auroraProjectPickerList");
    const configure = document.getElementById("auroraPickerConfigure");
    const reconnect = document.getElementById("auroraPickerReconnect");
    const create = document.getElementById("auroraPickerCreate");
    const status = document.getElementById("auroraProjectPickerStatus");
    if (!list) return;
    const ready = Boolean(auroraStorageHandle && auroraProjectsHandle);
    const needsPermission = Boolean(auroraStorageHandle && !ready);
    if (configure) configure.hidden = Boolean(auroraStorageHandle);
    if (reconnect) reconnect.hidden = !needsPermission;
    if (create) create.disabled = !ready;
    if (status) status.textContent = ready
      ? (projects.length ? projects.length + " projeto(s) carregado(s) de .aurora/projects." : "Armazenamento conectado. Ainda não há projetos em .aurora/projects.")
      : needsPermission
        ? "Encontramos sua pasta .aurora salva. Autorize novamente o acesso para carregar seus projetos."
        : "O armazenamento .aurora ainda não foi configurado neste navegador.";
    list.innerHTML = projects.length
      ? projects.map(project => '<button type="button" class="aurora-project-picker-item" data-picker-project="' + escapeHTML(project.id) + '"><span class="aurora-picker-folder">▰</span><span><strong>' + escapeHTML(project.name) + '</strong><small>' + escapeHTML(project.id) + ' · ' + (project.entryCount ? project.entryCount + ' itens' : 'Projeto vazio') + '</small></span><span class="aurora-picker-arrow">↗</span></button>').join("")
      : needsPermission
        ? '<div class="aurora-picker-empty"><strong>Permissão necessária.</strong><span>Seus projetos continuam na pasta .aurora. Reconecte o armazenamento para visualizá-los.</span></div>'
        : '<div class="aurora-picker-empty"><strong>Nenhum projeto encontrado.</strong><span>Configure o armazenamento ou crie seu primeiro projeto.</span></div>';
  };
  const storageChoice = document.getElementById("auroraStorageChoice");
  const openProjectPicker = async () => {
    if (!projectPicker) return;
    await loadRealProjects();
    renderProjectPicker();
    projectPicker.showModal();
  };
  document.getElementById("developButton")?.addEventListener("click", () => {
    const message = document.getElementById("auroraStorageChoiceMessage");
    if (message) message.textContent = "";
    storageChoice?.showModal();
  });
  document.getElementById("auroraStorageChoiceCancel")?.addEventListener("click", () => storageChoice?.close());
  document.getElementById("auroraDeviceStorage")?.addEventListener("click", async () => {
    storageChoice?.close();
    try {
      if (!window.isSecureContext || !window.showDirectoryPicker) {
        const message = document.getElementById("auroraStorageChoiceMessage");
        if (message) message.textContent = "Este navegador não oferece acesso a pastas locais. Use Chrome ou Edge atualizado em HTTPS.";
        storageChoice?.showModal();
        return;
      }
      if (!auroraStorageHandle) auroraStorageHandle = await readAuroraHandle();
      if (!auroraStorageHandle) {
        window.dispatchEvent(new CustomEvent("aurora:change-storage-location"));
        return;
      }
      const granted = await window.AuroraStorageAccess.requestReadWrite(auroraStorageHandle);
      if (!granted) {
        window.dispatchEvent(new CustomEvent("aurora:change-storage-location"));
        return;
      }
      await loadRealProjects();
      await openProjectPicker();
    } catch (error) {
      console.warn("[Aurora] Não foi possível acessar o armazenamento local:", error);
      window.dispatchEvent(new CustomEvent("aurora:change-storage-location"));
    }
  });
  document.getElementById("auroraPickerCancel")?.addEventListener("click", () => projectPicker?.close());
  document.getElementById("auroraPickerReconnect")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const status = document.getElementById("auroraProjectPickerStatus");
    button.disabled = true;
    if (status) status.textContent = "Solicitando autorização para a pasta .aurora…";
    let failureMessage = "";
    try {
      if (!auroraStorageHandle) auroraStorageHandle = await readAuroraHandle();
      if (!auroraStorageHandle || auroraStorageHandle.name !== ".aurora") {
        throw new Error("Não encontramos a pasta .aurora salva. Configure o armazenamento novamente.");
      }
      const granted = await window.AuroraStorageAccess.requestReadWrite(auroraStorageHandle);
      if (!granted) throw new Error("A autorização não foi concedida. Seus arquivos permanecem intactos.");
      const loaded = await loadRealProjects();
      if (!loaded) throw new Error("A pasta foi autorizada, mas não foi possível carregar .aurora/projects.");
    } catch (error) {
      failureMessage = error.message || "Não foi possível reconectar o armazenamento.";
      console.warn("[Aurora] Falha ao reconectar .aurora:", error);
    } finally {
      button.disabled = false;
      renderProjectPicker();
      if (failureMessage && status) status.textContent = failureMessage;
    }
  });
  document.getElementById("auroraPickerCreate")?.addEventListener("click", () => {
    if (!auroraStorageHandle || !auroraProjectsHandle) {
      notify("Configure primeiro o armazenamento .aurora.");
      return;
    }
    createProjectForEditor = true;
    projectPicker?.close();
    openNewProjectDialog();
  });
  document.getElementById("auroraPickerConfigure")?.addEventListener("click", () => {
    projectPicker?.close();
    window.dispatchEvent(new CustomEvent("aurora:change-storage-location"));
  });
  document.getElementById("auroraProjectPickerList")?.addEventListener("click", event => {
    const item = event.target.closest("[data-picker-project]");
    if (!item) return;
    const project = projects.find(entry => entry.id === item.dataset.pickerProject);
    if (project) openProjectInEditor(project);
  });

  const homeMarkup = main.innerHTML;
  let projects = [];
  projects = [];
  let selectedProjectId = projects[0]?.id || "";
  const persistProjects = () => storageSet("aurora-projects", JSON.stringify(projects));

  const selectedProject = () => projects.find(project => project.id === selectedProjectId) || projects[0] || null;
  let auroraStorageHandle = null;
  let auroraProjectsHandle = null;
  const dateLabel = value => value ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"long",timeStyle:"short"}).format(new Date(value)) : "Não disponível";
  const formatBytes = bytes => { if(!bytes)return "0 B"; const units=["B","KB","MB","GB"]; const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3); return (bytes/Math.pow(1024,i)).toFixed(i?1:0)+" "+units[i]; };
  const openProjectDB = () => new Promise((resolve,reject)=>{const req=indexedDB.open("AuroraProjectManager",1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("workspace"))req.result.createObjectStore("workspace");};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const readAuroraHandle = async()=>{const db=await openProjectDB();const handle=await new Promise((resolve,reject)=>{const req=db.transaction("workspace","readonly").objectStore("workspace").get("auroraStorage");req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});db.close();return handle;};
  const readProjectIndex = async config=>{try{const file=await(await config.getFileHandle("project-index.json")).getFile();const data=JSON.parse(await file.text());return data&&typeof data==="object"?data:{};}catch(_){return {};}};
  const writeProjectIndex = async(config,index)=>{const handle=await config.getFileHandle("project-index.json",{create:true});const writable=await handle.createWritable();await writable.write(JSON.stringify(index,null,2));await writable.close();};
  const scanProjectDirectory = async(handle,prefix="",entries=[])=>{for await(const [name,child] of handle.entries()){const path=prefix?prefix+"/"+name:name;if(child.kind==="directory"){entries.push({name,path,kind:"directory"});await scanProjectDirectory(child,path,entries);}else{const file=await child.getFile();entries.push({name,path,kind:"file",size:file.size,lastModified:file.lastModified});}}return entries;};
  const languageFor = name=>{const ext=name.split(".").pop().toLowerCase();const map={js:"JavaScript",mjs:"JavaScript",cjs:"JavaScript",jsx:"JavaScript",ts:"TypeScript",tsx:"TypeScript",html:"HTML",htm:"HTML",css:"CSS",scss:"SCSS",sass:"Sass",rs:"Rust",py:"Python",java:"Java",kt:"Kotlin",go:"Go",php:"PHP",rb:"Ruby",sql:"SQL",json:"JSON",yaml:"YAML",yml:"YAML",md:"Markdown",sh:"Shell",c:"C",cpp:"C++",cs:"C#",swift:"Swift",vue:"Vue",svelte:"Svelte"};return map[ext]||null;};
  const loadRealProjects = async () => {
    try {
      auroraStorageHandle = await readAuroraHandle();
      if (!auroraStorageHandle || auroraStorageHandle.name !== ".aurora") {
        auroraProjectsHandle = null;
        projects = [];
        selectedProjectId = "";
        renderProjectSidebar();
        if (document.getElementById("project-list")) renderProjectList();
        return false;
      }

      const permission = await auroraStorageHandle.queryPermission({ mode: "readwrite" }).catch(() => "prompt");
      if (permission !== "granted") {
        // A permissão pode expirar entre visitas. Não descarte o handle salvo:
        // a interface oferece uma ação explícita para reautorizá-lo.
        auroraProjectsHandle = null;
        projects = [];
        selectedProjectId = "";
        renderProjectSidebar();
        if (document.getElementById("project-list")) renderProjectList();
        return false;
      }

      auroraProjectsHandle = await auroraStorageHandle.getDirectoryHandle("projects", { create: true });
      const config = await auroraStorageHandle.getDirectoryHandle("config", { create: true });
      const index = await readProjectIndex(config);
      const actual = [];

      for await (const [name, handle] of auroraProjectsHandle.entries()) {
        if (handle.kind !== "directory") continue;
        const id = index[name]?.id || ("AUR-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase());
        const entries = await scanProjectDirectory(handle);
        const last = entries.reduce((n, item) => Math.max(n, item.lastModified || 0), 0);
        const modifiedAt = last ? new Date(last).toISOString() : (index[name]?.modifiedAt || null);
        if (!index[name]) index[name] = { id, createdAt: null, modifiedAt };
        actual.push({
          id, name, description: "", kind: "PROJETO",
          createdAt: index[name].createdAt || null,
          modifiedAt, entryCount: entries.length, handle, entries
        });
      }

      await writeProjectIndex(config, index);
      projects = actual;
      if (!projects.some(project => project.id === selectedProjectId)) {
        selectedProjectId = projects[0]?.id || "";
      }
      renderProjectSidebar();
      if (document.getElementById("project-list")) renderProjectList();
      return true;
    } catch (error) {
      auroraProjectsHandle = null;
      projects = [];
      selectedProjectId = "";
      renderProjectSidebar();
      if (document.getElementById("project-list")) renderProjectList();
      console.warn("[Aurora] Falha ao ler projetos reais:", error);
      return false;
    }
  };
  const renderRealProperties = async project=>{const host=document.getElementById("real-project-properties");if(!host||!project)return;const pageTitle=main.querySelector(".page-title");if(pageTitle)pageTitle.textContent=project.name;document.title="Aurora EDS — "+project.name;host.innerHTML='<div class="real-project-loading">Lendo arquivos do projeto…</div>';try{const handle=project.handle||await auroraProjectsHandle.getDirectoryHandle(project.name);const entries=await scanProjectDirectory(handle);const files=entries.filter(x=>x.kind==="file");const counts={};let totalBytes=0;files.forEach(file=>{totalBytes+=file.size||0;const lang=languageFor(file.name);if(lang)counts[lang]=(counts[lang]||0)+(file.size||1);});const total=Object.values(counts).reduce((a,b)=>a+b,0);const langs=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([name,size])=>({name,pct:total?size/total*100:0}));const config=await auroraStorageHandle.getDirectoryHandle("config",{create:true});const index=await readProjectIndex(config);const meta=index[project.name]||{};const bar=langs.length?langs.map(x=>'<i style="width:'+x.pct+'%" title="'+escapeHTML(x.name)+'"></i>').join(""):"";const legend=langs.length?langs.map(x=>'<div><span>'+escapeHTML(x.name)+'</span><strong>'+x.pct.toFixed(1)+'%</strong></div>').join(""):'<p class="real-project-muted">A composição será formada conforme os arquivos forem adicionados.</p>';const tech=langs.length?langs.map(x=>'<span class="real-tech-chip">'+escapeHTML(x.name)+'</span>').join(""):'<span class="real-project-muted">Nenhuma tecnologia identificada ainda.</span>';const tree=entries.length?entries.map(x=>'<div class="real-tree-row '+(x.kind==="directory"?"is-folder":"is-file")+'" style="--depth:'+x.path.split("/").length+'"><span>'+(x.kind==="directory"?"▰":"·")+'</span><span>'+escapeHTML(x.path)+'</span><small>'+(x.kind==="file"?formatBytes(x.size):"PASTA")+'</small></div>').join(""):'<div class="real-project-empty"><strong>Vazio...</strong><p>Que tal começar seu projeto?</p></div>';host.innerHTML='<div class="property-toolbar"><button class="property-back" type="button" data-back-projects>← Voltar para projetos</button><div class="property-toolbar-actions"><span class="property-status"><i></i> PROJETO LOCAL</span><button type="button" class="property-enter-eds" data-enter-eds>Entrar no EDS <span aria-hidden="true">↗</span></button></div></div><section class="property-identity"><div class="property-project-mark">⌘</div><div class="property-identity-copy"><span class="micro-label">PROJETO · '+escapeHTML(project.id)+'</span><h2>'+escapeHTML(project.name)+'</h2><p>Informações obtidas diretamente da pasta do projeto.</p></div><span class="property-kind">LOCAL</span></section><section class="property-section"><div class="section-heading"><span>IDENTIFICAÇÃO</span><span>DADOS REAIS</span></div><div class="property-fields"><div class="property-field"><span>AID · Aurora Identificator</span><strong class="property-mono">'+escapeHTML(project.id)+'</strong></div><div class="property-field"><span>Data de criação</span><strong>'+dateLabel(meta.createdAt||project.createdAt)+'</strong></div><div class="property-field"><span>Última modificação</span><strong>'+dateLabel(project.modifiedAt||meta.modifiedAt)+'</strong></div><div class="property-field"><span>Arquivos e pastas</span><strong>'+entries.length+' itens · '+formatBytes(totalBytes)+'</strong></div></div></section><section class="property-section"><div class="section-heading"><span>COMPOSIÇÃO DO PROJETO</span><span>'+(langs.length?"POR TAMANHO DE ARQUIVO":"SEM ARQUIVOS")+'</span></div><div class="language-bar real-language-bar '+(!langs.length?"is-empty":"")+'">'+bar+'</div><div class="language-legend real-language-legend">'+legend+'</div></section><section class="property-section"><div class="section-heading"><span>TECNOLOGIAS UTILIZADAS</span><span>DETECTADAS NOS ARQUIVOS</span></div><div class="technology-list real-technology-list">'+tech+'</div></section><section class="property-section"><div class="section-heading"><span>ESTRUTURA DO PROJETO</span><span>'+entries.length+' ITENS</span></div><div class="file-explorer"><div class="file-explorer-head"><span>⌘ &nbsp; '+escapeHTML(project.name.toUpperCase())+'</span><span>DISCO LOCAL</span></div><div class="file-tree real-file-tree">'+tree+'</div></div></section>';}catch(error){host.innerHTML='<div class="real-project-empty"><strong>Não foi possível ler o projeto.</strong><p>'+escapeHTML(error.message||String(error))+'</p></div>';}};
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
    if (list) list.innerHTML = projects.length ? projects.map((project, index) => `<div class="project-line" data-open-project data-project-id="${escapeHTML(project.id)}" role="button" tabindex="0" aria-label="Abrir propriedades de ${escapeHTML(project.name)}"><span class="project-line-index">${String(index + 1).padStart(2, "0")}</span><div class="project-line-main"><strong>${escapeHTML(project.name)}</strong><small>${escapeHTML(project.id)} · ${project.entryCount ? project.entryCount+" itens" : "Vazio..." } · Modificado: ${escapeHTML(project.modifiedAt ? dateLabel(project.modifiedAt) : "Não disponível")}</small></div><span class="project-line-state"><i></i>${"LOCAL"}</span><span class="project-line-arrow">↗</span></div>`).join("") : '<div class="projects-empty"><strong>Nenhum projeto por aqui</strong><p>Crie um projeto para começar a desenvolver.</p></div>';
  };
  const pages = {
    inicio:{title:"Início",eyebrow:"Sua estação de desenvolvimento",lead:"Um espaço para criar, explorar e transformar possibilidades em projetos.",render:()=>homeMarkup},
    projetos:{title:"Projetos",eyebrow:"ESPAÇO DE CRIAÇÃO",lead:"Cada ideia começa em algum lugar. Reúna seus experimentos e acompanhe o que está construindo.",render:()=>[
      '<div class="project-command"><div><span class="micro-label">ÁREA DE TRABALHO</span><strong>Seus projetos</strong></div><button class="action-primary" data-action="new-project">＋ Novo projeto</button></div>',
      projects.length ? `<section class="project-feature" data-open-project data-project-id="${escapeHTML(projects[0].id)}" role="button" tabindex="0" aria-label="Abrir propriedades de ${escapeHTML(projects[0].name)}"><div class="project-symbol">⌘</div><div class="project-feature-copy"><span class="micro-label">PROJETO EM DESTAQUE</span><h2>${escapeHTML(projects[0].name)}</h2><p>${escapeHTML(projects[0].id)} · ${projects[0].entryCount ? projects[0].entryCount+" itens" : "Vazio..."}</p><div class="project-progress-meta"><span>Última modificação</span><strong>${escapeHTML(projects[0].modifiedAt ? dateLabel(projects[0].modifiedAt) : "Não disponível")}</strong></div></div><div class="project-feature-status"><i></i> ${escapeHTML(projects[0].kind || "PROJETO")}</div></section>` : '<div class="projects-empty projects-empty-feature"><strong>Nenhum projeto criado</strong><p>Use “Novo projeto” para adicionar seu primeiro projeto.</p></div>',
      '<div class="section-heading"><span>SEUS PROJETOS</span><span id="project-count"></span></div><div class="project-table" id="project-list"></div><div class="quiet-hint">Projetos salvos neste navegador ficam disponíveis neste dispositivo. A sincronização entre dispositivos será integrada futuramente.</div>'
    ].join("")},
    propriedades:{title:"Projeto",eyebrow:"PROPRIEDADES DO PROJETO",lead:"Dados reais, composição técnica, tecnologias e estrutura do projeto.",render:()=>'<div id="real-project-properties" class="real-project-loading">Carregando informações reais do projeto…</div>'},
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
    sobre:{title:"Sobre o Aurora",eyebrow:"IDENTIDADE DO PRODUTO",lead:"Informações, componentes e documentos oficiais da estação.",render:()=>[
      '<section class="about-hero"><div class="about-word">Aurora<span>.</span></div><div class="about-definition"><span class="micro-label">EDS · ESTAÇÃO DE DESENVOLVIMENTO DE SISTEMAS</span><h2>Um ambiente para pensar, experimentar e construir.</h2><p>O Aurora reúne ferramentas de desenvolvimento em uma estação criada pela Korczak Technologies.</p></div><div class="about-coordinate">KORCZAK TECHNOLOGIES<br>PRODUCT / 001</div></section>',
      '<div class="section-heading"><span>INFORMAÇÕES DO APLICATIVO</span><span>IDENTIFICAÇÃO</span></div><div class="about-information"><div class="about-information-row"><span>Versão</span><strong>0.0.1</strong></div><div class="about-information-row"><span>Nome do aplicativo</span><strong>Aurora EDS</strong></div><div class="about-information-row"><span>API</span><strong>AuroraAPI</strong></div><div class="about-information-row"><span>Desenvolvedor</span><strong>Korczak Technologies</strong></div><div class="about-information-row"><span>Licença</span><strong>Fechada</strong></div><div class="about-information-row"><span>Direitos Autorais</span><strong>Korczak HUB 2026</strong></div><div class="about-information-row"><span>Banco de Dados</span><strong>Korczak DB</strong></div><div class="about-information-row"><span>Segurança e Privacidade</span><strong>KZSecurity</strong></div><div class="about-information-row"><span>Atualizador</span><strong>Korczak HUB Releases</strong></div></div>',
      '<div class="section-heading"><span>DOCUMENTAÇÃO</span><span>INFORMAÇÕES E REFERÊNCIAS</span></div><div class="about-document-links"><div class="about-document-row"><div><strong>Política de Privacidade</strong><small>Saiba como os dados são tratados nesta versão do Aurora.</small></div><button class="text-action" type="button" data-about-page="privacidade">Abrir página <span>↗</span></button></div><div class="about-document-row"><div><strong>Termos de Uso</strong><small>Consulte as condições de utilização do aplicativo.</small></div><button class="text-action" type="button" data-about-page="termos">Abrir página <span>↗</span></button></div><div class="about-document-row"><div><strong>Créditos</strong><small>Conheça a autoria e os componentes utilizados.</small></div><button class="text-action" type="button" data-about-page="creditos">Abrir página <span>↗</span></button></div></div>',
      '<div class="section-heading"><span>DOWNLOAD</span><span>VERSÃO E DISTRIBUIÇÃO</span></div><div class="about-download-row"><div><strong>Obter o Aurora</strong><small>Acesse a página oficial de download e distribuição.</small></div><a class="action-primary inline-action" href="https://site.korczaktech.com.br/#/download/aurora" target="_blank" rel="noopener noreferrer">Abrir Link <span>↗</span></a></div>'
    ].join("")},
    privacidade:{title:"Política de Privacidade",eyebrow:"DOCUMENTAÇÃO · PRIVACIDADE",lead:"Como as informações são tratadas na versão atual do Aurora.",render:()=>[
      '<div class="about-document-page"><button class="property-back" type="button" data-about-back>← Voltar para Sobre o Aurora</button><p class="about-document-updated">Aurora EDS · Versão 0.0.1 · Korczak Technologies</p><section><h2>1. Escopo desta política</h2><p>Esta política descreve o funcionamento de privacidade da versão 0.0.1 do Aurora EDS, enquanto a autenticação e os serviços de backend ainda não estão disponíveis.</p></section><section><h2>2. Armazenamento local</h2><p>Projetos, anotações, preferências e histórico de atividade podem ser armazenados no armazenamento local do navegador. Esses dados permanecem no dispositivo e no perfil de navegador utilizados, podendo ser apagados pela limpeza dos dados do navegador.</p></section><section><h2>3. Transmissão de dados</h2><p>Nesta versão frontend, o Aurora não oferece conta, sincronização entre dispositivos nem envio desses dados locais para um banco de dados remoto. Ao abrir links externos, o acesso passa a seguir as políticas do respectivo serviço.</p></section><section><h2>4. Controle do usuário</h2><p>O usuário pode alterar as preferências disponíveis e remover dados locais pelas ferramentas do navegador. Desinstalar ou limpar os dados do navegador pode tornar essas informações indisponíveis.</p></section><section><h2>5. Atualizações</h2><p>Esta política poderá ser atualizada quando novos recursos, integrações e serviços forem disponibilizados. A versão e a data de revisão deverão acompanhar futuras publicações.</p></section><section><h2>6. Contato</h2><p>Para assuntos relacionados ao Aurora, consulte os canais oficiais da Korczak Technologies.</p></section></div>'
    ].join("")},
    termos:{title:"Termos de Uso",eyebrow:"DOCUMENTAÇÃO · UTILIZAÇÃO",lead:"Condições gerais para utilizar a versão atual do Aurora EDS.",render:()=>[
      '<div class="about-document-page"><button class="property-back" type="button" data-about-back>← Voltar para Sobre o Aurora</button><p class="about-document-updated">Aurora EDS · Versão 0.0.1 · Korczak Technologies</p><section><h2>1. Aceitação</h2><p>Ao acessar ou utilizar o Aurora EDS, o usuário declara que leu e compreendeu estes termos. Caso não concorde, deverá interromper a utilização do aplicativo.</p></section><section><h2>2. Finalidade</h2><p>O Aurora é uma estação de desenvolvimento de sistemas. Nesta versão, parte dos recursos é demonstrativa ou limitada ao navegador, e recursos de execução, compilação, autenticação e sincronização ainda não estão disponíveis.</p></section><section><h2>3. Uso permitido</h2><p>O usuário é responsável pelos conteúdos, códigos e arquivos que criar ou importar, bem como por respeitar a legislação aplicável e os direitos de terceiros.</p></section><section><h2>4. Propriedade intelectual</h2><p>O aplicativo, sua identidade, marca e componentes proprietários pertencem à Korczak Technologies ou aos respectivos titulares. A licença do Aurora é fechada. Estes termos não concedem licença para copiar, modificar, redistribuir ou explorar comercialmente o aplicativo.</p></section><section><h2>5. Disponibilidade e limitações</h2><p>O Aurora está em desenvolvimento e pode apresentar limitações, alterações ou indisponibilidade. Os dados mantidos apenas no navegador podem ser perdidos por falhas, limpeza ou alteração do dispositivo.</p></section><section><h2>6. Atualizações dos termos</h2><p>Estes termos poderão ser revisados conforme o aplicativo evoluir. A versão publicada nesta página será a referência vigente dentro do aplicativo.</p></section></div>'
    ].join("")},
    creditos:{title:"Créditos",eyebrow:"DOCUMENTAÇÃO · AUTORIA",lead:"Pessoas, organizações e tecnologias relacionadas à construção do Aurora.",render:()=>[
      '<div class="about-document-page"><button class="property-back" type="button" data-about-back>← Voltar para Sobre o Aurora</button><section><h2>Desenvolvimento</h2><p><strong>Korczak Technologies</strong><br>Desenvolvimento, direção de produto e manutenção do Aurora EDS.</p></section><section><h2>Identidade do produto</h2><p><strong>Aurora EDS</strong><br>Estação de Desenvolvimento de Sistemas.</p></section><section><h2>Componentes e tecnologias</h2><p>Esta versão utiliza tecnologias web para a interface, incluindo HTML, CSS e JavaScript. Bibliotecas e componentes de terceiros, quando incorporados, devem ser identificados conforme suas respectivas licenças e avisos de distribuição.</p></section><section><h2>Marcas e direitos</h2><p>Aurora, Korczak Technologies, Korczak HUB, AuroraAPI, Korczak DB e KZSecurity são nomes e identificações associados ao ecossistema Korczak. Marcas e componentes de terceiros pertencem aos seus respectivos titulares.</p></section></div>'
    ].join("")},
    configuracoes:{title:"Configurações",eyebrow:"PREFERÊNCIAS DA ESTAÇÃO",lead:"Gerencie o comportamento da interface e consulte o estado dos recursos disponíveis.",render:()=>[
      '<div class="settings-layout"><nav class="settings-index"><span class="micro-label">CATEGORIAS</span><a class="settings-nav-active" href="#settings-general">Geral <span>01</span></a><a href="#settings-privacy">Conta e privacidade <span>02</span></a><a href="#settings-storage">Armazenamento <span>03</span></a></nav><div class="settings-content">',
      '<section id="settings-general" class="settings-group"><div class="section-heading"><span>GERAL</span><span>01</span></div><label class="preference-line"><span><strong>Abrir na página inicial</strong><small>Começar pela Início; desativado, retoma a última seção visitada.</small></span><input class="switch" type="checkbox" data-setting="start-home"></label><label class="preference-line"><span><strong>Confirmar ações importantes</strong><small>Pedir confirmação antes de limpar o histórico de atividade.</small></span><input class="switch" type="checkbox" data-setting="confirm"></label><label class="preference-line"><span><strong>Salvar preferências neste dispositivo</strong><small>Manter suas escolhas após fechar e reabrir o navegador.</small></span><input class="switch" type="checkbox" data-setting="local"></label></section>',
      '<section id="settings-privacy" class="settings-group"><div class="section-heading"><span>CONTA E PRIVACIDADE</span><span>02</span></div><div class="settings-info-line"><div><strong>Conta Aurora</strong><small>Autenticação e perfil ainda dependem da integração de conta.</small></div><span class="setting-state">NÃO CONECTADA</span></div><div class="settings-info-line"><div><strong>Sincronização</strong><small>Nenhum dado é enviado a um servidor nesta versão frontend.</small></div><span class="setting-state">INATIVA</span></div><div class="settings-info-line"><div><strong>Preferências locais</strong><small>Você controla se as preferências ficam salvas neste navegador.</small></div><span class="setting-state setting-local">SOB SEU CONTROLE</span></div></section>',
      '<section id="settings-storage" class="settings-group"><div class="section-heading"><span>ARMAZENAMENTO</span><span>03</span></div><div class="settings-info-line settings-storage-location"><div><strong>Local dos projetos (.aurora)</strong><small id="settings-aurora-storage-description">O local escolhido guarda projetos, configurações e arquivos da estação.</small></div><div class="settings-storage-actions"><span class="setting-state setting-local" id="settings-aurora-storage-status">VERIFICANDO</span><button type="button" class="settings-storage-change" id="settings-change-aurora-location">Alterar local</button></div></div><div class="settings-info-line"><div><strong>Anotações</strong><small>Conteúdo mantido no armazenamento do navegador.</small></div><span class="setting-state setting-local" id="settings-notes-status">LOCAL</span></div><div class="settings-info-line"><div><strong>Projetos</strong><small>Projetos criados nesta estação.</small></div><span class="setting-state setting-local" id="settings-projects-status">LOCAL</span></div><div class="settings-info-line"><div><strong>Repositórios</strong><small>Endereços registrados apenas durante a sessão atual.</small></div><span class="setting-state setting-local" id="settings-repos-status">SESSÃO</span></div><div class="settings-info-line"><div><strong>Histórico de atividade</strong><small>Eventos recentes registrados pelo Aurora.</small></div><span class="setting-state setting-local" id="settings-activity-status">LOCAL</span></div></section></div></div>'
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
    storageSet("aurora-activity", JSON.stringify(activityEvents));
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
    if (storageMetric) storageMetric.textContent = "Local";
    list.innerHTML = activityEvents.length ? activityEvents.map(item => `<div class="activity-event"><span class="event-node"></span><time>${escapeHTML(formatActivityTime(item.at))}</time><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.description || "")}</p></div><span class="event-kind">${escapeHTML(item.kind || "SISTEMA")}</span></div>`).join("") : '<div class="empty-state"><strong>Nenhuma atividade registrada</strong><p>Suas ações nesta estação aparecerão aqui.</p></div>';
  };
  const refreshStorageStatus = async () => {
    if (!auroraStorageHandle) { try { auroraStorageHandle = await readAuroraHandle(); } catch (_) {} }
    const auroraPermission = auroraStorageHandle ? await auroraStorageHandle.queryPermission({mode:"readwrite"}).catch(()=>"prompt") : "denied";
    const auroraStatus = main.querySelector("#settings-aurora-storage-status");
    const auroraDescription = main.querySelector("#settings-aurora-storage-description");
    if (auroraStatus) { auroraStatus.textContent = auroraPermission === "granted" ? "CONECTADO" : auroraStorageHandle ? "PERMISSÃO NECESSÁRIA" : "NÃO CONFIGURADO"; }
    if (auroraDescription) auroraDescription.textContent = auroraPermission === "granted" ? "A pasta .aurora está conectada. Você pode alterar o destino sem mover ou apagar os arquivos atuais." : auroraStorageHandle ? "O local já está cadastrado, mas o navegador precisa renovar a autorização. Use Alterar local para escolher e autorizar novamente." : "Escolha um local para criar a pasta .aurora e armazenar seus projetos.";
    const notesStatus = main.querySelector("#settings-notes-status");
    const projectsStatus = main.querySelector("#settings-projects-status");
    const reposStatus = main.querySelector("#settings-repos-status");
    const activityStatus = main.querySelector("#settings-activity-status");
    if (notesStatus) notesStatus.textContent = getSetting("local") ? `${notes.length} NOTA(S) · LOCAL` : `${notes.length} NOTA(S) · SESSÃO`;
    if (projectsStatus) projectsStatus.textContent = getSetting("local") ? `${projects.length} PROJETO(S) · LOCAL` : `${projects.length} PROJETO(S) · SESSÃO`;
    if (reposStatus) reposStatus.textContent = `${repos.length} REPOSITÓRIO(S) · SESSÃO`;
    if (activityStatus) activityStatus.textContent = "LOCAL";
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
    navItems.forEach(item => item.classList.toggle("is-active", item.dataset.page === (["privacidade","termos","creditos"].includes(key) ? "sobre" : key === "propriedades" ? "projetos" : key)));
    main.classList.toggle("app-page", key !== "inicio");
    main.classList.remove("page-propriedades");
    if (key === "propriedades") main.classList.add("page-propriedades");
    main.innerHTML = key === "inicio" ? homeMarkup : `<div class="main-atmosphere" aria-hidden="true"><span class="star star-a"></span><span class="star star-b"></span><span class="star star-c"></span><div class="aurora-ribbon ribbon-one"></div><div class="aurora-ribbon ribbon-two"></div><div class="aurora-ribbon ribbon-three"></div></div><div class="page-shell"><div class="page-eyebrow">${page.eyebrow}</div><h1 class="page-title">${page.title}</h1><p class="page-lead">${page.lead}</p>${page.render()}</div>`;
    if (projectsSidebar) projectsSidebar.hidden = key !== "inicio";
    document.title = "Aurora EDS — " + page.title;
    if (getSetting("local")) storageSet("aurora-last-page", key);
    if (key === "propriedades" && selectedProject()) renderRealProperties(selectedProject());
    /* Project properties are populated from the selected on-disk directory. */
    if (false && key === "propriedades" && selectedProject()) {
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
    if (event.target.closest("#settings-change-aurora-location")) { window.dispatchEvent(new CustomEvent("aurora:change-storage-location")); return; }
    const aboutPageButton = event.target.closest("[data-about-page]");
    if (aboutPageButton) { showPage(aboutPageButton.dataset.aboutPage); return; }
    if (event.target.closest("[data-about-back]")) { showPage("sobre"); return; }
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
    const deleteProjectButton = event.target.closest("[data-delete-project]");
    if (deleteProjectButton) {
      event.preventDefault();
      event.stopPropagation();
      const project = projects.find(item => item.id === deleteProjectButton.dataset.deleteProject);
      if (!project) return;
      notify("A exclusão física de projetos pode esperar.");
      return;
    }
    const projectTrigger = event.target.closest("[data-open-project], .project-entry");
    if (projectTrigger) { selectedProjectId = projectTrigger.dataset.projectId || ""; showPage("propriedades"); return; }
    const enterEds = event.target.closest("[data-enter-eds]");
    if (enterEds) { openProjectInEditor(selectedProject()); return; }
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
      openNewProjectDialog();
    }
    if (action === "clear-activity") {
      if (getSetting("confirm") && !window.confirm("Deseja limpar todo o histórico de atividade deste navegador?")) return;
      activityEvents = [];
      storageSet("aurora-activity", "[]");
      renderActivity();
      notify("Histórico de atividade limpo.");
    }
    if (action === "new-note") { document.getElementById("note-title").value = ""; document.getElementById("note-body").value = ""; document.getElementById("note-title").focus(); }
    if (action === "save-note") {
      const title = document.getElementById("note-title").value.trim();
      const body = document.getElementById("note-body").value.trim();
      if (!title && !body) { notify("Escreva algo antes de salvar."); return; }
      notes.unshift({ title, body, updatedAt:Date.now() });
      storageSet("aurora-notes", JSON.stringify(notes));
      recordActivity("Anotação salva: " + (title || "Sem título"), "Uma anotação foi criada nesta estação.", "ANOTAÇÃO");
      renderNotes(); notify("Anotação salva neste navegador.");
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
    if ((event.target.matches("[data-open-project]")) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectedProjectId = event.target.dataset.projectId || ""; showPage("propriedades"); }
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
        ["animations","contrast","compact","start-home","confirm","last-page"].forEach(name => { try { window.localStorage.removeItem(name === "last-page" ? "aurora-last-page" : "aurora-setting-" + name); } catch (_) {} });
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

  const openNewProjectDialog = () => {
    const dialog=document.getElementById("auroraNewProjectDialog");
    const input=document.getElementById("auroraNewProjectName");
    const message=document.getElementById("auroraNewProjectMessage");
    if(!dialog||!input){notify("Menu de criação indisponível.");return;}
    input.value=""; if(message)message.textContent="";
    dialog.showModal(); input.focus();
  };
  document.getElementById("auroraNewProjectCancel")?.addEventListener("click",()=>{createProjectForEditor=false;document.getElementById("auroraNewProjectDialog")?.close();});
  document.getElementById("auroraNewProjectDialog")?.addEventListener("cancel",()=>{createProjectForEditor=false;});
  document.getElementById("auroraNewProjectForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const input=document.getElementById("auroraNewProjectName");
    const message=document.getElementById("auroraNewProjectMessage");
    const button=document.getElementById("auroraNewProjectSubmit");
    const name=input.value.trim();
    if(!name||name==="."||name===".."||/[\\/<>:"|?*]/.test(name)||/[. ]$/.test(name)){message.textContent="Nome inválido. Evite barras e caracteres reservados.";return;}
    button.disabled=true; message.textContent="Criando pasta do projeto…";
    try{
      if(!auroraStorageHandle)auroraStorageHandle=await readAuroraHandle();
      if(!auroraStorageHandle)throw new Error("Configure primeiro o armazenamento .aurora na tela inicial.");
      const permissionGranted = await window.AuroraStorageAccess.requestReadWrite(auroraStorageHandle);
      if (!permissionGranted) throw new Error("Permissão de gravação em .aurora não concedida.");
      auroraProjectsHandle=await auroraStorageHandle.getDirectoryHandle("projects");
      try{await auroraProjectsHandle.getDirectoryHandle(name);throw new Error("Já existe um projeto com esse nome.");}
      catch(error){if(error.name!=="NotFoundError")throw error;}
      const folder=await auroraProjectsHandle.getDirectoryHandle(name,{create:true});
      const now=new Date().toISOString();
      const config=await auroraStorageHandle.getDirectoryHandle("config",{create:true});
      const index=await readProjectIndex(config);
      const id="AUR-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
      index[name]={id,createdAt:now,modifiedAt:now};
      await writeProjectIndex(config,index);
      const project={id,name,description:"",kind:"PROJETO",createdAt:now,modifiedAt:now,entryCount:0,handle:folder,entries:[]};
      projects.push(project);selectedProjectId=id;
      renderProjectSidebar();document.getElementById("auroraNewProjectDialog")?.close();
      recordActivity("Projeto criado: "+name,"Pasta vazia criada em .aurora/projects.","PROJETO");
      if (createProjectForEditor) {
        createProjectForEditor = false;
        openProjectInEditor(project);
        return;
      }
      showPage("propriedades");notify("Projeto criado em .aurora/projects.");
    }catch(error){message.textContent=error.message||String(error);}
    finally{button.disabled=false;}
  });
  renderProjectSidebar();
  loadRealProjects();
  recordActivity("Ambiente Aurora aberto", "A estação foi iniciada neste navegador.", "SISTEMA");
  window.addEventListener("aurora:storage-ready", async () => {
    await loadRealProjects();
    refreshStorageStatus();
    if (projectPicker?.open) renderProjectPicker();
  });
  const rememberedPage = storageGet("aurora-last-page", "inicio");
  const initialPage = getSetting("start-home") ? "inicio" : (Object.prototype.hasOwnProperty.call(pages, rememberedPage) ? rememberedPage : "inicio");
  showPage(initialPage);
  window.addEventListener("beforeunload", () => {
    if (getSetting("local")) storageSet("aurora-last-page", document.querySelector(".rail-item.is-active")?.dataset.page || "inicio");
  });
})();