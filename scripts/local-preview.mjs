import http from'node:http';
import path from'node:path';
import{fileURLToPath,pathToFileURL}from'node:url';
import{readFile,stat}from'node:fs/promises';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.wasm':'application/wasm','.glb':'model/gltf-binary','.pdf':'application/pdf','.woff2':'font/woff2'};
export function createPreviewServer(root){
 root=path.resolve(root);
 return http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const target=path.resolve(root,'.'+(route==='/'?'/index.html':route)),relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403).end();return;}
  try{
   const info=await stat(target);if(!info.isFile()){res.writeHead(404).end();return;}
   const bytes=req.method==='HEAD'?null:await readFile(target);
   res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache'});
   res.end(bytes??undefined);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500).end();}
 });
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
 const root=option('--root')??fileURLToPath(new URL('./web/',import.meta.url)),port=Number(option('--port')??5426);
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('端口须为1024—65535之间的整数');
 const server=createPreviewServer(root);server.on('error',error=>{console.error('本地服务未启动：'+error.message+'。端口已占用时可通过 --port 5427 指定其他端口。');process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`花落知多少已就绪：http://127.0.0.1:${port}/\n请在浏览器中打开，按 Ctrl+C 结束本服务。`));
}
