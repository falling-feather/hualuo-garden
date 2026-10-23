export interface DetailCandidate {id:string;distance:number;inView:boolean}

/** Distances are measured from the courtyard bounds, not its centre. */
export function selectDetailedLandmarks(candidates:readonly DetailCandidate[],active:string|null,previous:ReadonlySet<string>):Set<string> {
  const eligible=candidates.filter(item=>item.inView&&item.distance<(item.id===active?100:previous.has(item.id)?28:19));
  eligible.sort((a,b)=>Number(b.id===active)-Number(a.id===active)||a.distance-b.distance);
  return new Set(eligible.slice(0,2).map(item=>item.id));
}
