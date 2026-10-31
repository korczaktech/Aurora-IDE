(() => {
  "use strict";
  const API="https://aurora-api-cc1d.onrender.com";
  const token=()=>localStorage.getItem("aurora-access-token")||sessionStorage.getItem("aurora-access-token")||"";
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let root=null,sessions=[],activeId=null,view="terminal",socket=null,terminal=null,fitAddon=null,resizeObserver=null,terminals=new Map(),outputLogs=new Map(),outputDecoders=new Map(),closed=false,history=[],historyIndex=0;
  const views=[["terminal","TERMINAL"],["output","OUTPUT"],["debug","DEBUG CONSOLE"],["problems","PROBLEMS"],["ports","PORTS"]];
  async function api(path,options={}) {
    const response=await fetch(API+path,{...options,headers:{Accept:"application/json",Authorization:"Bearer "+token(),...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});
    if(response.status===204)return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Falha na comunicação com o terminal ("+response.status+").");
    return data;
  }
  function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
  function current(){return sessions.find(s=>s.id===activeId);}
  function status(text){const n=root?.querySelector("[data-terminal-status]");if(n)n.textContent=text;}
  function appendOutput(id,text){
    if(!text)return;
    const limit=262144;
    let value=(outputLogs.get(id)||"")+text;
    if(value.length>limit)value=value.slice(-limit);
    outputLogs.set(id,value);
    if(view==="output"&&activeId===id){
      const panel=root?.querySelector("[data-terminal-output]");
      if(panel){const follow=panel.scrollHeight-panel.scrollTop-panel.clientHeight<32;panel.textContent=value||"Nenhuma saída recebida.";if(follow)panel.scrollTop=panel.scrollHeight;}
    }
  }
  function recordBinaryOutput(id,bytes){
    let decoder=outputDecoders.get(id);
    if(!decoder){decoder=new TextDecoder();outputDecoders.set(id,decoder);}
    appendOutput(id,decoder.decode(bytes,{stream:true}));
  }
  function renderOutput(stage){
    const panel=el("pre","aurora-terminal-output",outputLogs.get(activeId)||"Nenhuma saída recebida nesta sessão.");
    panel.dataset.terminalOutput="";
    stage.append(panel);
    panel.scrollTop=panel.scrollHeight;
  }
  function stopSocket(){if(socket){socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;socket.close();socket=null;}}
  function detachTerminal(){if(resizeObserver){resizeObserver.disconnect();resizeObserver=null;}terminal=null;fitAddon=null;}
  function disposeSessionTerminal(id){const instance=terminals.get(id);if(instance){instance.terminal.dispose();terminals.delete(id);}if(activeId===id)detachTerminal();}
  function fit(){if(!terminal||!fitAddon||!socket||socket.readyState!==WebSocket.OPEN)return;try{fitAddon.fit();send({type:"resize",columns:terminal.cols,rows:terminal.rows});}catch(_){}}
  function connect(){
    stopSocket();
    const session=current();if(!session)return;
    status("Solicitando conexão segura…");
    api("/terminal/sessions/"+encodeURIComponent(session.id)+"/ticket",{method:"POST"}).then(grant=>{
      if(closed||activeId!==session.id)return;
      const wsUrl=API.replace(/^http/,"ws")+"/terminal/ws";
      socket=new WebSocket(wsUrl,["aurora-terminal","aurora-ticket."+grant.ticket]);
      socket.binaryType="arraybuffer";
      socket.onopen=()=>{status("Conectado · Bash real");fit();terminal?.focus();};
      socket.onmessage=event=>{
        if(event.data instanceof ArrayBuffer){const bytes=new Uint8Array(event.data);recordBinaryOutput(session.id,bytes);terminal?.write(bytes);return;}
        let message;try{message=JSON.parse(event.data);}catch(_){return;}
        if(message.type==="ready"){status("Conectado · Bash real");}
        else if(message.type==="output"){terminal?.write(message.data||"");}
        else if(message.type==="error"){const line="\r\n[Aurora] "+message.message+"\r\n";terminal?.write("\r\n\x1b[31m"+line+"\x1b[0m");appendOutput(session.id,line);}
        else if(message.type==="exit"){const decoder=outputDecoders.get(session.id);if(decoder)appendOutput(session.id,decoder.decode());status("Processo encerrado · código "+(message.exit_code??"indisponível"));terminal?.write("\r\n\x1b[90m[Processo encerrado]\x1b[0m\r\n");}
      };
      socket.onerror=()=>status("Erro na conexão");
      socket.onclose=()=>{if(!closed)status("Desconectado · use Reconectar");};
    }).catch(error=>{status("Falha");terminal?.write("\r\n\x1b[31m[Aurora] "+error.message+"\x1b[0m\r\n");});
  }
  async function load(){
    const result=await api("/terminal/sessions");
    sessions=result.sessions||[];
    if(!sessions.some(s=>s.id===activeId))activeId=sessions[0]?.id||null;
    render();
    if(activeId)connect();else await create();
  }
  async function create(){
    status("Criando sessão Bash…");
    const result=await api("/terminal/sessions",{method:"POST",body:"{}"});
    sessions.push(result.session);activeId=result.session.id;history=[];historyIndex=0;outputLogs.set(activeId,"");outputDecoders.delete(activeId);render();connect();
  }
  async function closeSession(){
    const session=current();if(!session)return;
    stopSocket();
    await api("/terminal/sessions/"+encodeURIComponent(session.id),{method:"DELETE"});
    disposeSessionTerminal(session.id);
    outputLogs.delete(session.id);outputDecoders.delete(session.id);
    sessions=sessions.filter(s=>s.id!==session.id);activeId=sessions[0]?.id||null;render();
    if(activeId)connect();else await create();
  }
  function buildTerminal(stage){
    detachTerminal();
    if(!window.Terminal||!window.FitAddon?.FitAddon){
      stage.append(el("p","editor-empty-message","Não foi possível carregar o emulador xterm.js. Verifique a conexão e recarregue o editor."));return;
    }
    let instance=terminals.get(activeId);
    if(instance){
      terminal=instance.terminal;
      fitAddon=instance.fitAddon;
      stage.append(instance.host);
    }else{
      const host=el("div","aurora-xterm-host");stage.append(host);
      terminal=new window.Terminal({cursorBlink:true,convertEol:true,scrollback:5000,fontSize:12,fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',theme:{background:"#050a0b",foreground:"#c5d5cd",cursor:"#8fe0b4",selectionBackground:"#315343"}});
      fitAddon=new window.FitAddon.FitAddon();terminal.loadAddon(fitAddon);terminal.open(host);
      terminal.onData(data=>send({type:"input",data}));
      terminal.onResize(size=>send({type:"resize",columns:size.cols,rows:size.rows}));
      instance={host,terminal,fitAddon};
      terminals.set(activeId,instance);
    }
    resizeObserver=new ResizeObserver(()=>fit());resizeObserver.observe(instance.host);
    requestAnimationFrame(()=>{fitAddon?.fit();terminal?.focus();fit();});
  }
  function renderStage(){
    detachTerminal();
    const stage=root.querySelector("[data-terminal-stage]");stage.replaceChildren();
    if(view==="terminal"){
      if(activeId)buildTerminal(stage);
      else stage.append(el("p","editor-empty-message","Crie um terminal para iniciar o Bash."));
      return;
    }
    if(view==="output"){renderOutput(stage);return;}
    const messages={
      debug:"O adaptador de depuração ainda não está conectado.",
      problems:"Nenhum analisador de problemas está conectado.",
      ports:"O encaminhamento de portas ainda não está conectado."
    };
    stage.append(el("div","aurora-terminal-output",messages[view]||""));
  }
  function render(){
    if(!root)return;
    const picker=root.querySelector("[data-terminal-picker]"),rail=root.querySelector("[data-terminal-sessions]");
    picker.replaceChildren();rail.replaceChildren();
    sessions.forEach(s=>{
      const option=el("option","",s.name+" · "+s.id.slice(0,8));option.value=s.id;picker.append(option);
      const item=el("button","aurora-terminal-session"+(s.id===activeId?" is-active":""),s.name+" · "+s.id.slice(0,8));
      item.type="button";item.onclick=()=>{if(activeId===s.id)return;stopSocket();activeId=s.id;history=[];historyIndex=0;render();connect();};rail.append(item);
    });
    picker.value=activeId||"";
    picker.onchange=()=>{stopSocket();activeId=picker.value;render();connect();};
    root.querySelector("[data-terminal-tabs]").replaceChildren(...views.map(([key,label])=>{
      const button=el("button","aurora-terminal-tab"+(view===key?" is-active":""),label);button.type="button";
      button.onclick=()=>{if(view===key)return;view=key;renderStage();root.querySelectorAll(".aurora-terminal-tab").forEach(b=>b.classList.toggle("is-active",b===button));};
      return button;
    }));
    renderStage();
    status(current()?"Sessão "+current().id.slice(0,8)+" · "+current().status:"Sem sessão");
  }
  function mount(container){
    closed=false;root=container;
    const shell=el("div","aurora-terminal-workbench"),toolbar=el("div","aurora-terminal-toolbar"),left=el("div","aurora-terminal-toolbar-left"),right=el("div","aurora-terminal-toolbar-right");
    const add=el("button","aurora-terminal-new","+ Novo terminal");add.type="button";add.onclick=()=>create().catch(e=>status("Erro: "+e.message));
    const picker=el("select","aurora-terminal-picker");picker.dataset.terminalPicker="";picker.setAttribute("aria-label","Sessões Bash");
    const reconnect=el("button","aurora-terminal-icon","↻");reconnect.type="button";reconnect.title="Reconectar";reconnect.onclick=connect;
    const kill=el("button","aurora-terminal-icon","×");kill.type="button";kill.title="Encerrar sessão";kill.onclick=()=>closeSession().catch(e=>status("Erro: "+e.message));
    left.append(add,picker);right.append(reconnect,kill);toolbar.append(left,right);
    const main=el("div","aurora-terminal-main"),rail=el("aside","aurora-terminal-sessions"),content=el("section","aurora-terminal-content"),tabs=el("div","aurora-terminal-tabs"),stage=el("div","aurora-terminal-stage"),foot=el("div","aurora-terminal-status","Iniciando…");
    rail.dataset.terminalSessions="";tabs.dataset.terminalTabs="";stage.dataset.terminalStage="";foot.dataset.terminalStatus="";
    content.append(tabs,stage);main.append(rail,content);shell.append(toolbar,main,foot);container.append(shell);
    load().catch(error=>{status("Falha ao iniciar");stage.replaceChildren(el("p","editor-empty-message",error.message));});
  }
  function unmount(){closed=true;stopSocket();detachTerminal();root=null;}
  window.AuroraTerminal={mount,unmount};
})();