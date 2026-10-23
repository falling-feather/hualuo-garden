import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url='http://127.0.0.1:5416/';
const response=await fetch(url+'garden.manifest.json').catch(()=>null);
if(!response?.ok)throw new Error('请先在本项目运行 npm run dev，再运行 npm run open。');
const manifest=await response.json();
if(manifest.schema!==1||manifest.name!=='花落知多少')throw new Error('端口 5416 上的服务不是本项目园景，请检查本地服务。');
const executable=[path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles??'C:/Program Files','Microsoft/Edge/Application/msedge.exe')].find(existsSync);
if(!executable)throw new Error('未找到 Microsoft Edge；可以直接用浏览器访问 '+url);
const profile=path.join(root,'.cache/garden-browser');
await mkdir(profile,{recursive:true});
const child=spawn(executable,['--user-data-dir='+profile,'--no-first-run','--start-maximized','--force_high_performance_gpu','--app='+url],{cwd:root,detached:true,stdio:'ignore'});
child.unref();
console.log('已打开本地园林窗口：'+url+'；独立预览配置位于 .cache/garden-browser。');
