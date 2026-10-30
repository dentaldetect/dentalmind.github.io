import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('./evidence.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const {summarizeEvidence}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
const finding=(atlas_fdi,code,decision)=>({atlas_fdi,code,decision,score:.6});

test('uncertain findings remain visible as possible findings without becoming positives',()=>{
  const map=summarizeEvidence([finding('16','caries','uncertain')]);
  assert.equal(map['16'].kind,'uncertain');assert.match(map['16'].label,/Possible caries/);assert.match(map['16'].label,/review required/);
  assert.equal(map['26'],undefined);
});
test('treatment history and provisional findings are labelled with their original semantics',()=>{
  const map=summarizeEvidence([finding('37','root_canal_treated','positive'),finding('37','caries','uncertain')]);
  assert.equal(map['37'].kind,'positive');assert.match(map['37'].label,/root canal treated/);assert.match(map['37'].label,/Possible caries/);
});
test('unassigned evidence cannot mark an arbitrary atlas tooth or imply healthy teeth',()=>{
  assert.deepEqual(summarizeEvidence([finding(null,'caries','positive')]),{});
  assert.deepEqual(summarizeEvidence([]),{});
});
