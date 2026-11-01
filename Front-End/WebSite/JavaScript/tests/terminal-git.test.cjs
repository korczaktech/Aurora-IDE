const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","terminal-git.js"),"utf8");
const windowMock={};
vm.runInNewContext(source,{window:windowMock,URL,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Date,Error,Promise,Map});
const {normalizePath,createFileSystem}=windowMock.AuroraGitInternals;

class FakeFile {
  constructor(name,bytes=new Uint8Array()){this.name=name;this.kind="file";this.bytes=new Uint8Array(bytes);this.lastModified=1;}
  async getFile(){const bytes=this.bytes.slice();return {size:bytes.length,lastModified:this.lastModified,arrayBuffer:async()=>bytes.buffer};}
  async createWritable(){const file=this;let next=file.bytes.slice();return {async write(value){next=typeof value==="string"?new TextEncoder().encode(value):value instanceof Uint8Array?value.slice():new Uint8Array(value);},async close(){file.bytes=next;file.lastModified++;},async abort(){}};}
}
class FakeDirectory {
  constructor(name=""){this.name=name;this.kind="directory";this.children=new Map();}
  async *entries(){for(const pair of this.children)yield pair;}
  async getDirectoryHandle(name,options={}){let item=this.children.get(name);if(!item&&options.create){item=new FakeDirectory(name);this.children.set(name,item);}if(!item||item.kind!=="directory"){const error=new Error("Directory not found");error.name=item?"TypeMismatchError":"NotFoundError";throw error;}return item;}
  async getFileHandle(name,options={}){let item=this.children.get(name);if(!item&&options.create){item=new FakeFile(name);this.children.set(name,item);}if(!item||item.kind!=="file"){const error=new Error("File not found");error.name=item?"TypeMismatchError":"NotFoundError";throw error;}return item;}
  async removeEntry(name){if(!this.children.has(name)){const error=new Error("Missing");error.name="NotFoundError";throw error;}this.children.delete(name);}
}

test("normaliza caminhos absolutos e relativos sem sair da raiz",()=>{
  assert.equal(normalizePath("/src/./lib/../main.js"),"/src/main.js");
  assert.equal(normalizePath(""),"/");
  assert.throws(()=>normalizePath("../../segredo"),/fora da raiz/);
  assert.throws(()=>normalizePath("src\\segredo"),/inválido/);
  assert.throws(()=>normalizePath("/arquivo?.js"),/inválido/);
});

test("filesystem Git grava e lê arquivos binários e texto",async()=>{
  const root=new FakeDirectory("project");
  const adapter=createFileSystem(root);
  await adapter.promises.mkdir("/src");
  await adapter.promises.writeFile("/src/main.js",new TextEncoder().encode("console.log('Aurora')"));
  assert.equal(new TextDecoder().decode(await adapter.promises.readFile("/src/main.js")),"console.log('Aurora')");
  assert.deepEqual(Array.from(await adapter.promises.readdir("/src")),["main.js"]);
  const stat=await adapter.promises.stat("/src/main.js");
  assert.equal(stat.isFile(),true);
  assert.equal(stat.size,21);
});

test("filesystem Git cria diretórios recursivos e remove arquivos",async()=>{
  const root=new FakeDirectory("project");
  const adapter=createFileSystem(root);
  await adapter.promises.mkdir("/a/b/c",{recursive:true});
  await adapter.promises.writeFile("/a/b/c/file.txt","conteúdo");
  await adapter.promises.unlink("/a/b/c/file.txt");
  assert.equal((await adapter.promises.readdir("/a/b/c")).length,0);
  assert.equal((await adapter.promises.stat("/a/b")).isDirectory(),true);
});

test("filesystem Git rejeita traversal e tipos incompatíveis",async()=>{
  const root=new FakeDirectory("project");
  const adapter=createFileSystem(root);
  await assert.rejects(adapter.promises.readFile("/../../secret"),/fora da raiz/);
  await adapter.promises.writeFile("/file.txt","x");
  await assert.rejects(adapter.promises.readdir("/file.txt"),/Não é um diretório/);
  await assert.rejects(adapter.promises.writeFile("/../../secret","x"),/fora da raiz/);
});