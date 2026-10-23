import type { Vec3 } from './types.ts';
export interface InteractionContext { id: string; landmarkId: string; kind: string }
export interface Interaction {
  id: string; landmarkId: string; label: string;
  position: Vec3; kind: 'object' | 'reading' | 'navigation';
  onActivate?: (context: InteractionContext) => void | Promise<void>;
}
export class Interactions extends EventTarget {
  #items = new Map<string, Interaction>();
  register(item: Interaction) {
    if (this.#items.has(item.id)) throw new Error('交互标识重复：' + item.id);
    if (item.position.length !== 3 || !item.position.every(Number.isFinite)) throw new RangeError('交互位置无效');
    const registered:Interaction={...item,position:[...item.position]};
    this.#items.set(registered.id,registered);
    return ()=>{if(this.#items.get(registered.id)===registered)this.#items.delete(registered.id);};
  }
  list() { return [...this.#items.values()].map(({ onActivate: _, ...item }) => ({ ...item, position: [...item.position] })); }
  async activate(id: string) {
    const item = this.#items.get(id);
    if (!item) throw new RangeError('未知交互：' + id);
    const context = { id, landmarkId: item.landmarkId, kind: item.kind };
    await item.onActivate?.(context);
    this.dispatchEvent(new CustomEvent('interact', { detail: context }));
    return context;
  }
}
