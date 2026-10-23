const WIND_ROLES=new Set(['foliage','tree_leaves','grove_foliage','evergreen','banana_leaves','herbs','reeds','groundcover','grass','grass_flower','blossom','cut_flower','lotus_flower','lotus']);
const SPECIAL_ROLES=new Set(['lantern_glow','water','mirror','leaf_litter','terrain','surroundings']);
export function windAmplitude(role:string){return !WIND_ROLES.has(role)?0:role==='grove_foliage'?.24:role==='grass'||role==='grass_flower'?.22:1;}
export function dynamicMaterialRole(role:string){return WIND_ROLES.has(role)||SPECIAL_ROLES.has(role)?role:'architecture';}
