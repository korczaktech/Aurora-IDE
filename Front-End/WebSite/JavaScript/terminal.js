(() => {
"use strict";
const sessions=new Map(), OUTPUT_LIMIT=524288, MAX_FILE=2097152;
let activeId=null, rootElement=null, view="terminal", nextId=1;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function tokenize(source){
 const out=[];let value="",quote="",escape=false,started=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(escape){value+=c;escape=false;started=true;continue;}
  if(c==="\\"&&quote!=="'"){escape=true;started=true;continue;}
  if(quote){if(c===quote)quote="";else value+=c;started=true;continue;}
  if(c==="'"||c==='"'){quote=c;started=true;continue;}
  if(/\s/.test(c)){if(started){out.push(value);value="";started=false;}continue;}
  if(c===">"||c==="|"){if(started){out.push(value);value="";started=false;}if(c===">"&&source[i+1]===">"){out.push(">>");i++;}else out.push(c);continue;}
  value+=c;started=true;
 }
 if(escape)value+="\\";
 if(quote)throw new Error("Aspas não foram fechadas.");
 if(started)out.push(value);
 return out;
}
function resolvePath(input,cwd){
 const value=String(input||".");
 const absolute=value.startsWith("/")||value==="~"||value.startsWith("~/");
 const parts=absolute?[]:cwd.split("/").filter(Boolean);
 const source=value==="~"?"":value.replace(/^~\/?/,"");
 for(const part of source.split("/")){
  if(!part||part===".")continue;
  if(part===".."){if(!parts.length)throw new Error("Acesso fora da raiz do projeto não é permitido.");parts.pop();continue;}
  if(part.includes("\0")||part.includes("\\")||/[<>:"|?*]/.test(part))throw new Error("Caminho inválido.");
  parts.push(part);
 }
 return parts.join("/");
}
const current=()=>sessions.get(activeId)||null;
function status(message){const n=rootElement?.querySelector("[data-terminal-status]");if(n)n.textContent=message;}
function append(session,text){const value=String(text??"");if(!value)return;session.output=(session.output+value).slice(-OUTPUT_LIMIT);session.terminal?.write(value.replace(/\n/g,"\r\n"));if(view==="output"&&activeId===session.id)renderOutput();}
const print=(session,text="")=>append(session,String(text)+"\n");
async function projectRoot(){
 const handle=window.AuroraProjectManager?.rootHandle;
 if(!handle)throw new Error("Nenhum projeto aberto. Abra um projeto em .aurora/projects primeiro.");
 let permission=await handle.queryPermission({mode:"readwrite"});
 if(permission!=="granted")permission=await handle.requestPermission({mode:"readwrite"});
 if(permission!=="granted")throw new Error("Acesso de leitura e gravação ao projeto não autorizado.");
 return handle;
}
async function getDir(path,create=false){let dir=await projectRoot();for(const part of path.split("/").filter(Boolean))dir=await dir.getDirectoryHandle(part,{create});return dir;}
async function getEntry(path){
 const parts=path.split("/").filter(Boolean);if(!parts.length)return {kind:"directory",handle:await projectRoot()};
 const name=parts.pop(),parent=await getDir(parts.join("/"));
 try{return {kind:"file",handle:await parent.getFileHandle(name),parent,name};}
 catch(_){try{return {kind:"directory",handle:await parent.getDirectoryHandle(name),parent,name};}catch(__){throw new Error("Não encontrado: "+path);}}
}
async function parentOf(path,create=false){const parts=path.split("/").filter(Boolean),name=parts.pop();if(!name)throw new Error("A raiz do projeto não pode ser substituída.");return {parent:await getDir(parts.join("/"),create),name};}
async function readText(path){const entry=await getEntry(path);if(entry.kind!=="file")throw new Error(path+" é uma pasta.");const file=await entry.handle.getFile();if(file.size>MAX_FILE)throw new Error("Arquivo maior que o limite de leitura (2 MB).");return file.text();}
async function writeText(path,text,appendMode=false){const target=await parentOf(path,true),handle=await target.parent.getFileHandle(target.name,{create:true}),writer=await handle.createWritable({keepExistingData:appendMode});if(appendMode){const file=await handle.getFile();await writer.seek(file.size);}await writer.write(String(text));await writer.close();}
async function copyHandle(source,name,destination){if(source.kind==="directory"){const dir=await destination.getDirectoryHandle(name,{create:true});for await(const [childName,child] of source.entries())await copyHandle(child,childName,dir);}else{const file=await source.getFile(),dest=await destination.getFileHandle(name,{create:true}),writer=await dest.createWritable();await writer.write(file);await writer.close();}}
async function copyEntry(sourcePath,targetPath){const source=await getEntry(sourcePath),target=await parentOf(targetPath,true);await copyHandle(source.handle,target.name,target.parent);}
async function list(path,hidden=false){const dir=await getDir(path),items=[];for await(const [name,handle] of dir.entries())if(hidden||!name.startsWith("."))items.push({name,kind:handle.kind});items.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==="directory"?-1:1);return items;}
async function walk(dir,prefix="",depth=0,out=[]){if(depth>14||out.length>=1500)return out;for await(const [name,handle] of dir.entries()){if(out.length>=1500)break;const path=prefix?prefix+"/"+name:name;out.push({path,kind:handle.kind});if(handle.kind==="directory")await walk(handle,path,depth+1,out);}return out;}
async function runWorker(session,code,python=false){
 const source=python
 ? "import {loadPyodide} from 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs';let py;self.onmessage=async(e)=>{try{if(!py)py=await loadPyodide({stdout:{batched:t=>postMessage({type:'out',text:t})},stderr:{batched:t=>postMessage({type:'err',text:t})}});await py.runPythonAsync(e.data.code);postMessage({type:'done'});}catch(x){postMessage({type:'fail',error:String(x)});}};"
 : "self.onmessage=async(e)=>{let lines=[];const out=(...a)=>lines.push(a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));const c={log:out,info:out,warn:(...a)=>out('[aviso]',...a),error:(...a)=>out('[erro]',...a),table:out};try{const A=Object.getPrototypeOf(async function(){}).constructor;await new A('console','args',e.data.code)(c,[]);postMessage({type:'done',text:lines.join('\\n')});}catch(x){postMessage({type:'fail',error:x.stack||String(x),text:lines.join('\\n')});}};";
 const blobUrl=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));const worker=new Worker(blobUrl,python?{type:"module"}:undefined);URL.revokeObjectURL(blobUrl);session.worker=worker;
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{worker.terminate();session.worker=null;session.cancelExecution=null;reject(new Error("Tempo limite de execução excedido."));},python?60000:10000);session.cancelExecution=()=>{clearTimeout(timeout);worker.terminate();session.worker=null;session.cancelExecution=null;resolve();};
  worker.onmessage=e=>{const d=e.data||{};if(d.type==="out")append(session,d.text);else if(d.type==="err")append(session,"\x1b[31m"+d.text+"\x1b[0m");else if(d.type==="done"||d.type==="fail"){clearTimeout(timeout);worker.terminate();session.worker=null;session.cancelExecution=null;if(d.text)print(session,d.text);if(d.type==="fail")reject(new Error(d.error));else resolve();}};
  worker.onerror=e=>{clearTimeout(timeout);worker.terminate();session.worker=null;session.cancelExecution=null;reject(new Error(e.message||"Falha no Worker."));};
  worker.postMessage({code});
 });
}
async function runCommand(session,raw){
 let tokens=[...raw],redirect=null,idx=tokens.findIndex(x=>x===">"||x===">>");
 if(idx>=0){if(idx!==tokens.length-2)throw new Error("Uso: comando > arquivo ou comando >> arquivo");redirect={path:resolvePath(tokens[idx+1],session.cwd),append:tokens[idx]===">>"};tokens=tokens.slice(0,idx);}
 const command=(tokens.shift()||"").toLowerCase(),args=tokens,out=[],emit=x=>out.push(String(x)),path=x=>resolvePath(x,session.cwd);
 const need=(n,usage)=>{if(args.length<n)throw new Error("Uso: "+usage);};
 switch(command){
 case "help":case "ajuda":emit(["Comandos: pwd, ls [-a] [-l], cd, tree, mkdir [-p], touch, cat, echo, printf,","cp, mv, rm [-r], head, tail, wc, grep, find, clear, date, whoami, uname, env, export, unset, memory,","js arquivo.js | js -e \"código\", python arquivo.py | python -c \"código\"","Tudo opera somente dentro da raiz do projeto aberto.","JavaScript roda em Web Worker sem APIs do Node.js; Python usa Pyodide/WebAssembly.","Python não monta automaticamente a pasta do projeto; npm, Cargo, Bash e processos nativos não estão disponíveis."].join("\n"));break;
 case "pwd":emit("/"+session.cwd);break;
 case "whoami":emit("aurora-user");break;
 case "uname":emit("Aurora Browser Runtime");break;
 case "date":emit(new Date().toString());break;
 case "clear":session.terminal?.clear();session.output="";return;
 case "memory":emit(performance.memory?"Heap JS: "+Math.round(performance.memory.usedJSHeapSize/1048576)+" MB usados":"Este navegador não expõe métricas detalhadas de memória.");break;
 case "cd":{const p=path(args[0]||"/"),e=await getEntry(p);if(e.kind!=="directory")throw new Error("Não é uma pasta.");session.cwd=p;return;}
 case "ls":case "dir":{const opts=args.filter(x=>x.startsWith("-")),target=args.find(x=>!x.startsWith("-"))||".",items=await list(path(target),opts.some(x=>x.includes("a")));emit(items.map(x=>(opts.some(x=>x.includes("l"))?(x.kind==="directory"?"d":"-")+"rw-r--r--  ":"")+x.name+(x.kind==="directory"?"/":"")).join("\n"));break;}
 case "tree":{const p=path(args[0]||"."),e=await getEntry(p);if(e.kind!=="directory")throw new Error("tree exige uma pasta.");const items=await walk(e.handle,p);emit((p||".")+"/\n"+items.map(x=>"  ".repeat(Math.max(1,x.path.split("/").length-(p?p.split("/").length:0)))+(x.kind==="directory"?"[D] ":"[F] ")+x.path.split("/").pop()).join("\n"));if(items.length>=1500)emit("Limite de 1500 itens alcançado.");break;}
 case "mkdir":{const recursive=args.includes("-p"),names=args.filter(x=>x!=="-p");need(1,"mkdir [-p] pasta");for(const name of names){const p=path(name);if(!p)throw new Error("A raiz já existe.");if(recursive)await getDir(p,true);else{const t=await parentOf(p);await t.parent.getDirectoryHandle(t.name,{create:true});}}break;}
 case "touch":need(1,"touch arquivo");for(const name of args){const t=await parentOf(path(name),true);await t.parent.getFileHandle(t.name,{create:true});}break;
 case "cat":need(1,"cat arquivo");for(const name of args)emit(await readText(path(name)));break;
 case "echo":emit(args.join(" "));break;
 case "printf":need(1,"printf texto");emit(args.join(" ").replace(/\\n/g,"\n").replace(/\\t/g,"\t"));break;
 case "rm":{const recursive=args.some(x=>["-r","-rf","-fr"].includes(x)),force=args.some(x=>["-f","-rf","-fr"].includes(x)),names=args.filter(x=>!x.startsWith("-"));need(1,"rm [-r] arquivo");for(const name of names){try{const p=path(name);if(!p)throw new Error("A raiz do projeto não pode ser excluída.");const e=await getEntry(p);if(e.kind==="directory"&&!recursive)throw new Error("Use rm -r para excluir pastas.");await e.parent.removeEntry(e.name,{recursive});}catch(error){if(!force)throw error;}}break;}
 case "cp":case "mv":{need(2,command+" origem destino");const from=path(args[0]),to=path(args[1]);if(!from||!to||to.startsWith(from+"/"))throw new Error("Destino inválido.");await copyEntry(from,to);if(command==="mv"){const e=await getEntry(from);await e.parent.removeEntry(e.name,{recursive:e.kind==="directory"});}break;}
 case "head":case "tail":{need(1,command+" arquivo");const lines=(await readText(path(args[0]))).split(/\r?\n/),nidx=args.indexOf("-n"),count=nidx>=0?Math.max(1,Math.min(1000,Number(args[nidx+1])||10)):10;emit((command==="head"?lines.slice(0,count):lines.slice(-count)).join("\n"));break;}
 case "wc":need(1,"wc arquivo");for(const name of args){const s=await readText(path(name));emit(s.split(/\r?\n/).length+" linhas  "+s.trim().split(/\s+/).filter(Boolean).length+" palavras  "+s.length+" caracteres  "+name);}break;
 case "grep":need(2,"grep padrão arquivo");for(const name of args.slice(1)){const lines=(await readText(path(name))).split(/\r?\n/);lines.forEach((line,i)=>{if(line.includes(args[0]))emit((args.length>2?name+":":"")+(i+1)+":"+line);});}break;
 case "find":{const base=args.find(x=>!x.startsWith("-")&&x!=="-name")||".",ni=args.indexOf("-name"),pattern=ni>=0?(args[ni+1]||"*"):"*",p=path(base),e=await getEntry(p);if(e.kind!=="directory")throw new Error("find exige uma pasta.");const matcher=new RegExp("^"+pattern.split("*").map(x=>x.replace(/[.*+?^$()|[\]\\]/g,"\\$&")).join(".*")+"$","i");emit((await walk(e.handle,p)).filter(x=>matcher.test(x.path.split("/").pop())).map(x=>x.path).join("\n"));break;}
 case "env":Object.entries(session.environment).forEach(([k,v])=>emit(k+"="+v));break;
 case "export":{need(1,"export NOME=valor");const s=args.join(" "),i=s.indexOf("="),k=s.slice(0,i);if(i<1||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))throw new Error("Use export NOME=valor.");session.environment[k]=s.slice(i+1);break;}
 case "unset":args.forEach(k=>delete session.environment[k]);break;
 case "js":case "javascript":{let code;if(args[0]==="-e"||args[0]==="--eval")code=args.slice(1).join(" ");else if(args[0])code=await readText(path(args[0]));else throw new Error("Uso: node arquivo.js ou node -e \"código\"");await runWorker(session,code,false);break;}
 case "node":throw new Error("Node.js completo não está disponível no navegador. Use js arquivo.js para executar JavaScript sem APIs do Node.js.");
 case "npm":case "cargo":case "bash":throw new Error("Este comando exige um ambiente de sistema operacional e não pode ser executado diretamente no navegador.");
 case "python":case "python3":case "py":{let code;if(args[0]==="-c")code=args.slice(1).join(" ");else if(args[0])code=await readText(path(args[0]));else throw new Error("Uso: python arquivo.py ou python -c \"código\"");await runWorker(session,code,true);break;}
 default:throw new Error("Comando não encontrado: "+command+". Digite help.");
 }
 const result=out.join("\n");if(redirect)await writeText(redirect.path,result+(result?"\n":""),redirect.append);else if(result)print(session,result);
}
async function executeLine(session,line){
 const value=line.trim();if(!value){prompt(session);return;}session.history.push(value);session.historyIndex=session.history.length;append(session,"\r\n");
 try{
  await window.AuroraProjectManager?.flush?.();
  const tokens=tokenize(value);if(tokens.includes("|"))throw new Error("Pipes ainda não são suportados.");
  const segments=[];let part=[];for(const token of tokens){if(token===";"){if(part.length)segments.push(part);part=[];}else part.push(token);}if(part.length)segments.push(part);
  for(const segment of segments)await runCommand(session,segment);
  status("Executando localmente · "+(window.AuroraProjectManager?.projectName||"projeto"));
 }catch(error){print(session,"\x1b[31m"+(error?.message||String(error))+"\x1b[0m");status("Erro no comando");}
 prompt(session);
}
function prompt(session){session.terminal?.write("\r\n\x1b[38;2;143;224;180m"+session.name+"\x1b[0m:\x1b[38;2;130;149;140m/"+session.cwd+"\x1b[0m$ ");}
function attach(session,stage){
 if(!window.Terminal||!window.FitAddon?.FitAddon){stage.append(el("p","editor-empty-message","Emulador de terminal indisponível."));return;}
 const host=el("div","aurora-xterm-host");stage.append(host);
 const term=new window.Terminal({cursorBlink:true,convertEol:true,scrollback:5000,fontSize:12,fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',theme:{background:"#050a0b",foreground:"#c5d5cd",cursor:"#8fe0b4",selectionBackground:"#315343"}});
 const fit=new window.FitAddon.FitAddon();term.loadAddon(fit);term.open(host);session.terminal=term;session.fitAddon=fit;session.host=host;let input="";
 term.onData(data=>{
  if(data==="\r"){const line=input;input="";executeLine(session,line);}
  else if(data==="\u007f"){if(input.length){input=input.slice(0,-1);term.write("\b \b");}}
  else if(data==="\u0003"){if(session.worker){session.cancelExecution?.();session.worker?.terminate();session.worker=null;print(session,"^C");}else{input="";term.write("^C");prompt(session);}}
  else if(data==="\u000c")term.clear();
  else if(data==="\u001b[A"||data==="\u001b[B"){const up=data==="\u001b[A";if(up&&session.historyIndex>0)session.historyIndex--;if(!up&&session.historyIndex<session.history.length)session.historyIndex++;input=session.history[session.historyIndex]||"";term.write("\r\x1b[2K");prompt(session);term.write(input);}
  else if(data==="\t"){term.write("  ");input+="  ";}
  else if(data>=" "&&data!=="\u007f"){input+=data;term.write(data);}
 });
 const observer=new ResizeObserver(()=>{try{fit.fit();}catch(_){}});observer.observe(host);session.dispose=()=>{observer.disconnect();term.dispose();};requestAnimationFrame(()=>{try{fit.fit();}catch(_){}term.focus();prompt(session);});
}
function renderOutput(){const s=current(),stage=rootElement?.querySelector("[data-terminal-stage]");if(!s||!stage)return;const pre=el("pre","aurora-terminal-output",s.output||"Nenhuma saída nesta sessão.");pre.dataset.terminalOutput="";stage.replaceChildren(pre);pre.scrollTop=pre.scrollHeight;}
function renderStage(){const stage=rootElement?.querySelector("[data-terminal-stage]");if(!stage)return;stage.replaceChildren();const s=current();if(view==="output"){renderOutput();return;}if(view!=="terminal"){stage.append(el("div","aurora-terminal-output","O terminal executa no navegador e acessa somente o projeto autorizado."));return;}if(!s)return;if(s.host){stage.append(s.host);requestAnimationFrame(()=>{try{s.fitAddon.fit();s.terminal.focus();}catch(_){}});}else attach(s,stage);}
function render(){
 if(!rootElement)return;const picker=rootElement.querySelector("[data-terminal-picker]"),rail=rootElement.querySelector("[data-terminal-sessions]");picker.replaceChildren();rail.replaceChildren();
 for(const s of sessions.values()){const option=el("option","",s.name);option.value=s.id;picker.append(option);const button=el("button","aurora-terminal-session"+(s.id===activeId?" is-active":""),s.name);button.type="button";button.onclick=()=>{activeId=s.id;render();};rail.append(button);}
 picker.value=activeId||"";picker.onchange=()=>{activeId=picker.value;render();};
 const tabs=rootElement.querySelector("[data-terminal-tabs]");tabs.replaceChildren();[["terminal","TERMINAL"],["output","OUTPUT"],["debug","DEBUG CONSOLE"],["problems","PROBLEMS"],["ports","PORTS"]].forEach(([key,label])=>{const b=el("button","aurora-terminal-tab"+(view===key?" is-active":""),label);b.type="button";b.onclick=()=>{view=key;renderStage();tabs.querySelectorAll("button").forEach(x=>x.classList.toggle("is-active",x===b));};tabs.append(b);});
 renderStage();status("Local no navegador · "+(window.AuroraProjectManager?.projectName||"projeto"));
}
function createSession(){const s={id:"local-"+nextId++,name:"terminal-"+(sessions.size+1),cwd:"",history:[],historyIndex:0,environment:Object.create(null),output:"",worker:null,terminal:null,fitAddon:null,host:null,dispose:null};sessions.set(s.id,s);activeId=s.id;view="terminal";render();}
function mount(container){
 rootElement=container;
 if(!window.AuroraProjectManager?.rootHandle){container.replaceChildren(el("p","editor-empty-message","Abra um projeto em .aurora/projects antes de iniciar o terminal."));return;}
 const shell=el("div","aurora-terminal-workbench"),toolbar=el("div","aurora-terminal-toolbar"),left=el("div","aurora-terminal-toolbar-left"),right=el("div","aurora-terminal-toolbar-right");
 const add=el("button","aurora-terminal-new","+ Novo terminal");add.type="button";add.onclick=createSession;
 const picker=el("select","aurora-terminal-picker");picker.dataset.terminalPicker="";picker.setAttribute("aria-label","Terminais locais");
 const close=el("button","aurora-terminal-icon","×");close.type="button";close.title="Encerrar terminal";close.onclick=()=>{const s=current();if(!s)return;s.worker?.terminate();s.dispose?.();sessions.delete(s.id);activeId=sessions.keys().next().value||null;if(!activeId)createSession();else render();};
 left.append(add,picker);right.append(close);toolbar.append(left,right);
 const main=el("div","aurora-terminal-main"),rail=el("aside","aurora-terminal-sessions"),content=el("section","aurora-terminal-content"),tabs=el("div","aurora-terminal-tabs"),stage=el("div","aurora-terminal-stage"),footer=el("div","aurora-terminal-status","Preparando terminal local…");
 rail.dataset.terminalSessions="";tabs.dataset.terminalTabs="";stage.dataset.terminalStage="";footer.dataset.terminalStatus="";
 content.append(tabs,stage);main.append(rail,content);shell.append(toolbar,main,footer);container.replaceChildren(shell);createSession();
}
function unmount(){for(const s of sessions.values()){s.worker?.terminate();s.dispose?.();}sessions.clear();rootElement=null;activeId=null;}
window.AuroraTerminalInternals=Object.freeze({tokenize,resolvePath});
window.AuroraTerminal=Object.freeze({mount,unmount});
})();