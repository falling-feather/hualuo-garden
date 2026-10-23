import type { GardenViewer } from './scene/viewer.ts';
import { Interactions } from './domain/interactions.ts';
import type { Interaction } from './domain/interactions.ts';
import type { LandmarkState, Season, ViewMode, Weather } from './domain/state.ts';
import type {GardenNarrative} from './scene/narrative.ts';
import type {MemoryId} from './domain/narrative.ts';

export class GardenAPI extends EventTarget {
  readonly schema=1;
  readonly ready:Promise<void>;
  #viewer:GardenViewer;
  #interactions:Interactions;
  #narrative:GardenNarrative;
  constructor(viewer:GardenViewer,interactions:Interactions,ready:Promise<void>,narrative:GardenNarrative){
    super();this.#viewer=viewer;this.#interactions=interactions;this.ready=ready;
    this.#narrative=narrative;
    narrative.addEventListener('change',event=>this.dispatchEvent(new CustomEvent('garden:memorychange',{detail:(event as CustomEvent).detail})));
    for(const type of ['timechange','weatherchange','seasonchange','focus','landmarkchange','playchange']){
      viewer.state.addEventListener(type,event=>this.dispatchEvent(new CustomEvent('garden:'+type,{detail:(event as CustomEvent).detail})));
    }
    interactions.addEventListener('interact',event=>this.dispatchEvent(new CustomEvent('garden:interact',{detail:(event as CustomEvent).detail})));
  }
  getState(){return this.#viewer.state.snapshot();}
  getLandmarks(){return this.#viewer.manifest.landmarks.map(({id,name,chapter,position,description})=>({id,name,chapter,position:[...position],description}));}
  setTime(hour:number){this.#viewer.state.setTime(hour);}
  setWeather(weather:Weather){this.#viewer.state.setWeather(weather);}
  setSeason(season:Season){this.#viewer.state.setSeason(season);}
  setTimeFlow(playing:boolean){this.#viewer.state.setPlaying(playing);}
  focus(id:string,view:ViewMode='courtyard'){return this.ready.then(()=>this.#viewer.focus(id,view));}
  overview(){return this.#viewer.overview();}
  setNavigationMode(mode:'walk'|'orbit'){this.#viewer.setNavigationMode(mode);}
  setQuality(quality:'fine'|'smooth'){this.#viewer.setQuality(quality);}
  setLandmarkState(id:string,state:Partial<LandmarkState>){this.#viewer.state.setLandmarkState(id,state);}
  registerInteraction(interaction:Interaction) {
    if(!this.#viewer.manifest.landmarks.some(item=>item.id===interaction.landmarkId))throw new RangeError('交互引用了未知院落');
    return this.#interactions.register(interaction);
  }
  activateInteraction(id:string){return this.#interactions.activate(id);}
  getInteractions(){return this.#interactions.list();}
  getDiagnostics(){return this.#viewer.diagnostics();}
  getNarrativeState(){return this.#narrative.snapshot();}
  goToMemory(id:MemoryId){return this.ready.then(()=>this.#narrative.goTo(id));}
}
declare global {interface Window {garden:GardenAPI}}
