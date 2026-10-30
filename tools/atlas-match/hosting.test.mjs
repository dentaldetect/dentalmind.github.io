import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const built=await build({entryPoints:[fileURLToPath(new URL('./hosting.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {resolveHosting}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
test('Pages project subpath uses packaged assets and makes no automatic backend assumption',()=>{
  const h=resolveHosting('https://dentaldetect.github.io/dentalmind.github.io/atlas/?example=1');
  assert.equal(h.apiBase,null);
  assert.equal(h.model,'https://dentaldetect.github.io/dentalmind.github.io/models/dentition/dentition.glb');
  assert.equal(h.catalog,'https://dentaldetect.github.io/dentalmind.github.io/atlas/catalog.json');
});
test('local Python viewer retains existing model and API paths',()=>{
  const h=resolveHosting('http://127.0.0.1:8082/v1/atlas/viewer/?example=1');
  assert.equal(h.apiBase,'http://127.0.0.1:8082/v1/atlas/');
  assert.equal(h.model,'http://127.0.0.1:8082/v1/atlas/assets/dentition.glb');
});
test('explicit HTTPS hosted backend uses its catalogue and analysis prefix',()=>{
  const h=resolveHosting('https://example.org/site/atlas/','https://api.example.org/v1/atlas');
  assert.equal(h.apiBase,'https://api.example.org/v1/atlas/');
  assert.equal(h.model,'https://example.org/site/models/dentition/dentition.glb');
});
test('mixed content, embedded credentials and wrong API prefixes are rejected',()=>{
  for(const url of ['http://api.example.org/v1/atlas/','https://user:secret@api.example.org/v1/atlas/','https://api.example.org/'])assert.throws(()=>resolveHosting('https://example.org/atlas/',url));
});
