export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export interface Landmark {
  id: string; name: string; subtitle: string; kind: string;
  position: Vec3; size: Vec2; rotation: number; chapter: string;
  quote: string; description: string; evidence: string[]; order: number;
  url: string; lodUrl: string; bytes: number; triangles: number;
  views: { courtyard: Vec3; interior: Vec3; look: Vec3; interiorLook:Vec3 };
}
export interface Collider { center: Vec3; size: Vec3; rotation: number; kind: string; landmarkId?: string }
export interface RectWalkSurface { kind?:'rect'; center: Vec2; size: Vec2; height: number; rotation: number }
export interface QuadWalkSurface { kind:'quad'; vertices:[Vec3,Vec3,Vec3,Vec3];routeId:string }
export type WalkSurface=RectWalkSurface|QuadWalkSurface;
export interface Terrain { size: number; bounds: [number, number, number, number]; heights: number[] }
export interface WorldChunk {id:string;url:string;bounds:[Vec3,Vec3];bytes:number;triangles:number}
export interface Manifest {
  schema: number; name: string; bounds: [number, number, number, number];
  landmarks: Landmark[]; worldUrl: string;
  worldChunks: WorldChunk[];
  colliders: Collider[]; surfaces: WalkSurface[]; terrain: Terrain;
  paths: Vec2[][];
  circulation:{nodes:Array<{id:string;kind:'port'|'junction';position:Vec3}>;routes:Array<{id:string;from:string;to:string;width:number;surface:string;points:Vec3[];navigation:Vec3[];bridge:boolean[]}>};
  water: { level: number; lake: Vec2[]; rivers: { width: number; points: Vec2[] }[] };
}
