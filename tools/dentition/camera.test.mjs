import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as THREE from 'three';

const compiled = await build({
  entryPoints: [new URL('../../src/dentition/scene.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { DentitionScene } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);

function cameraFixture() {
  const scene = Object.create(DentitionScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(30, 1, 0.005, 2);
  scene.controls = { target: new THREE.Vector3(), minDistance: 0.045, maxDistance: 0.42, update() {} };
  scene.host = { clientWidth: 600, clientHeight: 500 };
  scene.renderer = { setSize() {} };
  scene.outlineMaterials = {};
  scene.teeth = new Map();
  scene.topInset = 56;
  scene.reducedMotion = false;
  scene.framing = null;
  return scene;
}

test('a collapsed camera recovers when reset or focused', () => {
  const scene = cameraFixture();
  const target = new THREE.Vector3(0.01, 0.02, 0.01);
  scene.camera.position.copy(target);
  scene.controls.target.copy(target);
  scene.flyTo(target, new THREE.Vector3(-1, 0.1, 0).normalize(), 0.2, false);
  assert.ok(Math.abs(scene.camera.position.distanceTo(target) - 0.2) < 1e-8);
  assert.ok(scene.camera.position.toArray().every(Number.isFinite));
});

test('toolbar in a temporarily tiny panel cannot invert the fitting frustum', () => {
  const scene = cameraFixture();
  scene.host.clientHeight = 20;
  scene.topInset = 80;
  assert.ok(scene.fitDistance(0.03) > scene.controls.minDistance);
  scene.resize();
  assert.ok(scene.camera.projectionMatrix.elements.every(Number.isFinite));
  assert.ok(scene.camera.view.fullHeight < 2 * scene.host.clientHeight);
});

test('resize refits the active preset or selected tooth but preserves manual framing', () => {
  const scene = cameraFixture();
  scene.teeth.set('46', {});
  const calls = [];
  scene.goTo = (...args) => calls.push(['preset', ...args]);
  scene.focusTooth = (...args) => calls.push(['tooth', ...args]);
  scene.framing = { preset: 'right' };
  scene.resize();
  scene.framing = { tooth: '46' };
  scene.resize();
  scene.framing = null;
  scene.resize();
  assert.deepEqual(calls, [['preset', 'right', false], ['tooth', '46', false]]);
});

test('finding updates cannot expose roots; only the anatomy control can', () => {
  const scene=cameraFixture();
  const t={root:{visible:false}};scene.teeth.set('16',t);
  let anatomy=false;
  scene.conditionLayer={update(){},setAnatomy(on){anatomy=on;}};
  scene.roots=false;scene.refreshHighlights=()=>{};scene.gums=[];scene.gumMaterials=[];
  scene.setConditions({'16':[{kind:'root_canal',origin:'ai'}]});
  assert.equal(t.root.visible,false);assert.equal(anatomy,false);
  scene.setRoots(true);assert.equal(t.root.visible,true);assert.equal(anatomy,true);
  scene.setRoots(false);scene.setConditions({'16':[{kind:'periapical',origin:'ai'}]});
  assert.equal(t.root.visible,false);assert.equal(anatomy,false);
});

test('positive and uncertain evidence tint different teeth and clearing restores neutral anatomy',()=>{
  const scene=cameraFixture();
  const uniforms=()=>({uEvidence:{value:0},uEvidenceColor:{value:new THREE.Color()}});
  const first=uniforms(),second=uniforms(),unknown=uniforms();
  scene.teeth.set('16',{uniforms:[first]});scene.teeth.set('37',{uniforms:[second]});scene.teeth.set('26',{uniforms:[unknown]});
  scene.setEvidence({'16':'uncertain','37':'positive'});
  assert.ok(first.uEvidence.value>0&&second.uEvidence.value>0);assert.equal(unknown.uEvidence.value,0);
  assert.notEqual(first.uEvidenceColor.value.getHex(),second.uEvidenceColor.value.getHex());
  scene.setEvidence({});assert.equal(first.uEvidence.value,0);assert.equal(second.uEvidence.value,0);
});
