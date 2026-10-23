import {isNarrativeProgress} from './narrative.ts';
import type {NarrativeProgress} from './journey.ts';
import type {ViewCheckpoint}from'./view.ts';
import {isViewCheckpoint,viewWithinBounds}from'./view.ts';
import type {Season,Weather} from './state.ts';
import {SEASONS,WEATHER_TYPES} from './state.ts';

export const SAVE_KEY='hualuo.garden.journey.1';
export class UnsafeViewError extends Error{}
export interface GardenSave {schema:1;narrative:NarrativeProgress;view:ViewCheckpoint;environment:{hour:number;season:Season;weather:Weather};quality:'fine'|'smooth';savedAt:string}
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type SaveRead={kind:'empty'}|{kind:'valid';value:GardenSave}|{kind:'invalid'|'unsupported'|'unavailable';message:string};
export function parseGardenSave(raw:string|null,ids:readonly string[],bounds:readonly number[]):SaveRead{
  if(raw===null)return {kind:'empty'};
  if(raw.length>90000)return {kind:'invalid',message:'游园记录过大，已保留原记录。'};
  let data:GardenSave;try{data=JSON.parse(raw);}catch{return {kind:'invalid',message:'游园记录无法读取，已保留原记录。'};}
  if(!data||typeof data!=='object')return {kind:'invalid',message:'游园记录格式不完整。'};
  if(data.schema!==1)return {kind:'unsupported',message:'这份游园记录来自其他格式，暂不覆盖。'};
  const v=data.view,e=data.environment;
  if(!isNarrativeProgress(data.narrative)||!isViewCheckpoint(v)||v.landmark!==null&&!ids.includes(v.landmark)||!viewWithinBounds(v,bounds)
     ||!e||!Number.isFinite(e.hour)||e.hour<0||e.hour>=24||!SEASONS.includes(e.season)||!WEATHER_TYPES.includes(e.weather)
     ||!['fine','smooth'].includes(data.quality)||typeof data.savedAt!=='string'||!Number.isFinite(Date.parse(data.savedAt)))return {kind:'invalid',message:'游园记录的经历或位置不完整，已保留原记录。'};
  const pictureView=data.narrative.actions.painting?.view;
  if(pictureView&&(!viewWithinBounds(pictureView,bounds)||pictureView.landmark!==null&&!ids.includes(pictureView.landmark)))return {kind:'invalid',message:'画笺的取景位置无效，原记录已保留。'};
  return {kind:'valid',value:data};
}

/** Local-only journal. Failed writes keep the previous good record intact. */
export class GardenSaveStore {
  #storage:StoragePort|null;#blocked=false;
  constructor(storage:StoragePort|null){this.#storage=storage;}
  load(ids:readonly string[],bounds:readonly number[]):SaveRead{
    if(!this.#storage)return {kind:'unavailable',message:'浏览器暂不可保存，本次仍可正常游园。'};
    try{const result=parseGardenSave(this.#storage.getItem(SAVE_KEY),ids,bounds);this.#blocked=result.kind==='invalid'||result.kind==='unsupported';return result;}
    catch{return {kind:'unavailable',message:'浏览器暂不可读取记录，本次仍可正常游园。'};}
  }
  write(save:GardenSave){
    if(!this.#storage)return '浏览器暂不可保存，本次经历仍在当前页面。';
    if(this.#blocked)return '原游园记录已保留；选择重新游园才会替换。';
    try{this.#storage.setItem(SAVE_KEY,JSON.stringify(save));return null;}catch{return '本次未能保存，先前记录仍保留；请保持页面打开。';}
  }
  clear(){try{this.#storage?.removeItem(SAVE_KEY);this.#blocked=false;return null;}catch{return '浏览器未能清空旧记录。';}}
}
