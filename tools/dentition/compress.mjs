// Compress dentition.raw.glb into the web asset dentition.glb: weld, quantize and meshopt-compress every
// primitive, keeping each node, its name and its extras exactly as the Python build wrote them.
//
//   node tools/dentition/compress.mjs [in.glb] [out.glb]
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

const dir = fileURLToPath(new URL('../../public/models/dentition/', import.meta.url));
const input = process.argv[2] ?? fileURLToPath(new URL('./build/dentition.raw.glb', import.meta.url));
const output = process.argv[3] ?? `${dir}dentition.glb`;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(input);
const names = doc.getRoot().listNodes().map((n) => n.getName());
await doc.transform(
  weld(),
  reorder({ encoder: MeshoptEncoder }),
  // Positions to 14 bits over a 7.5 cm model is ~5 µm; normals to 10 bits.
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
);
const after = doc.getRoot().listNodes().map((n) => n.getName());
if (after.join() !== names.join()) throw new Error('node names changed during compression');
await io.write(output, doc);
const kb = async (p) => Math.round((await stat(p)).size / 1024);
console.log(`${output}: ${await kb(input)} KiB -> ${await kb(output)} KiB, ${after.length} nodes`);
