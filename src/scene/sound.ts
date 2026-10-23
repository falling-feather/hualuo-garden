import type { StateSnapshot } from '../domain/state.ts';

export class GardenSound {
  #context:AudioContext|null=null;
  #master:GainNode|null=null;
  #wind:GainNode|null=null;
  #stream:GainNode|null=null;
  #timer:number|null=null;
  #state:StateSnapshot|null=null;
  #presence=true;
  setPresence(value:boolean){this.#presence=value;if(this.#state)this.update(this.#state);}
  remember(){
    if(!this.enabled||!this.#context||!this.#master||!this.#presence)return;
    const context=this.#context,start=context.currentTime;
    for(const [i,frequency] of [261.63,392,523.25].entries()){
      const note=context.createOscillator(),gain=context.createGain();
      note.type='sine';note.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start+i*.14);gain.gain.linearRampToValueAtTime(.035,start+i*.14+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+i*.14+1.8);
      note.connect(gain);gain.connect(this.#master);note.start(start+i*.14);note.stop(start+i*.14+1.9);
      note.onended=()=>{note.disconnect();gain.disconnect();};
    }
  }
  enabled=false;
  async toggle() {
    if(!this.#context)this.#create();
    this.enabled=!this.enabled;
    if(this.enabled)await this.#context!.resume();
    this.#master!.gain.setTargetAtTime(this.enabled?.15:0,this.#context!.currentTime,.3);
    return this.enabled;
  }
  #create() {
    const context=this.#context=new AudioContext();
    const master=this.#master=context.createGain();
    master.gain.value=0;
    master.connect(context.destination);
    const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate);
    const data=buffer.getChannelData(0);
    let last=0;
    for(let i=0;i<data.length;i++){last=(last+Math.random()*.06-.03)*.985;data[i]=last;}
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=750;
    const wind=this.#wind=context.createGain();wind.gain.value=.55;
    source.connect(low);low.connect(wind);wind.connect(master);
    const band=context.createBiquadFilter();band.type='bandpass';band.frequency.value=1700;band.Q.value=.35;
    const stream=this.#stream=context.createGain();stream.gain.value=.38;
    source.connect(band);band.connect(stream);stream.connect(master);
    source.start();
    this.#timer=window.setInterval(()=>this.#bird(),6500);
    if(this.#state)this.update(this.#state);
  }
  #bird() {
    if(!this.enabled||!this.#presence||!this.#context||!this.#master||!this.#state)return;
    if(this.#state.hour<5.4||this.#state.hour>18.5||this.#state.weather==='rain')return;
    const context=this.#context;
    const start=context.currentTime+.1;
    for(let i=0;i<3;i++) {
      const oscillator=context.createOscillator();
      const envelope=context.createGain();
      oscillator.type='sine';
      const frequency=2100+Math.random()*650;
      oscillator.frequency.setValueAtTime(frequency,start+i*.15);
      oscillator.frequency.exponentialRampToValueAtTime(frequency*1.3,start+i*.15+.06);
      oscillator.frequency.exponentialRampToValueAtTime(frequency*.9,start+i*.15+.13);
      envelope.gain.setValueAtTime(0,start+i*.15);
      envelope.gain.linearRampToValueAtTime(.035,start+i*.15+.03);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+i*.15+.14);
      oscillator.connect(envelope);envelope.connect(this.#master);
      oscillator.start(start+i*.15);oscillator.stop(start+i*.15+.16);
      oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
    }
  }
  update(state:StateSnapshot) {
    this.#state=state;
    if(!this.#context)return;
    this.#wind!.gain.setTargetAtTime(state.weather==='rain'?1.1:state.weather==='snow'?.3:.55,this.#context.currentTime,1);
    this.#stream!.gain.setTargetAtTime(this.#presence?(state.activeLandmark?.includes('xiang')?.32:.4):.08,this.#context.currentTime,1);
  }
  get status(){return {enabled:this.enabled,presence:this.#presence,context:this.#context?.state??'inactive'};}
}
