import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicMaterialRole,windAmplitude} from '../src/domain/material-roles.ts';
test('低植被保留独立风动与季节语义，不被当作静态建筑',()=>{
 assert.equal(dynamicMaterialRole('grass'),'grass');assert.equal(dynamicMaterialRole('grass_flower'),'grass_flower');
 assert.equal(dynamicMaterialRole('tree_structure'),'architecture');assert.equal(dynamicMaterialRole('water'),'water');
 assert.equal(dynamicMaterialRole('grove_foliage'),'grove_foliage');assert.equal(dynamicMaterialRole('leaf_litter'),'leaf_litter');
 assert.equal(dynamicMaterialRole('terrain'),'terrain');assert.equal(dynamicMaterialRole('surroundings'),'surroundings');assert.equal(windAmplitude('terrain'),0);
 assert.equal(windAmplitude('leaf_litter'),0);assert.ok(windAmplitude('grove_foliage')<.3);
 assert.ok(windAmplitude('grass')<windAmplitude('tree_leaves'));assert.equal(windAmplitude('architecture'),0);
});
