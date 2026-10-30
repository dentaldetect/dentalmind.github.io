import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
const built=await build({entryPoints:[fileURLToPath(new URL('../../src/dentition/conditions.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {ConditionLayer,kindForCode}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);

function tooth(){
  const group=new THREE.Group();
  const crown=new THREE.Mesh(new THREE.SphereGeometry(.006,16,12),new THREE.MeshStandardMaterial());
  const root=new THREE.Mesh(new THREE.CylinderGeometry(.002,.001,.015,8),new THREE.MeshStandardMaterial());root.position.y=-.012;
  group.add(crown,root);group.updateMatrixWorld(true);
  return {group,crown,root,tip:new THREE.Vector3(0,.006,0),cej:new THREE.Vector3(0,-.005,0),axis:new THREE.Vector3(0,1,0),facial:new THREE.Vector3(0,0,1)};
}

test('fracture simulation changes a copy and clearing restores original anatomy',()=>{
  const t=tooth(),original=t.crown.geometry,positions=original.attributes.position.array.slice();
  const layer=new ConditionLayer();layer.update(new Map([['16',t]]),{'16':[{kind:'fracture',origin:'manual'}]});
  assert.notEqual(t.crown.geometry,original);
  assert.notDeepEqual(t.crown.geometry.attributes.position.array,positions);
  assert.deepEqual(original.attributes.position.array,positions);
  layer.clear();assert.equal(t.crown.geometry,original);assert.equal(t.group.children.length,2);
});

test('missing-tooth ghost and all overlays can be fully removed',()=>{
  for(const kind of ['missing','caries','restoration','periapical','root_canal']){
    const t=tooth(),material=t.crown.material,layer=new ConditionLayer();
    layer.update(new Map([['16',t]]),{'16':[{kind,origin:'manual'}]});
    if(kind==='missing')assert.equal(t.crown.material.opacity,.12);
    else assert.ok(t.group.children[2].children.length>0);
    layer.clear();assert.equal(t.crown.material,material);assert.equal(t.group.children.length,2);
  }
});

test('internal treatment and apical illustrations require explicit anatomy mode',()=>{
  const t=tooth(),layer=new ConditionLayer();t.root.visible=false;
  const map={'16':[{kind:'root_canal',origin:'ai'},{kind:'periapical',origin:'manual'}]};
  layer.update(new Map([['16',t]]),map);
  let internal=t.group.getObjectByName('anatomy_only_conditions');
  assert.equal(t.root.visible,false);assert.equal(internal.visible,false);
  layer.setAnatomy(true);assert.equal(internal.visible,true);
  layer.update(new Map([['16',t]]),map);
  internal=t.group.getObjectByName('anatomy_only_conditions');assert.equal(internal.visible,true);
  layer.setAnatomy(false);assert.equal(internal.visible,false);assert.equal(t.root.visible,false);
});

test('only explicit supported detector codes generate condition geometry',()=>{
  assert.equal(kindForCode('deep_caries'),'caries');
  assert.equal(kindForCode('root_canal_treated'),'root_canal');
  for(const code of ['bone_level_observation','missing','healthy','impacted_tooth','unrecognized'])assert.equal(kindForCode(code),null);
});
