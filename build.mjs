import { build } from 'esbuild';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

await mkdir('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/index.js'], outfile: 'dist/index.js', bundle: true,
  platform: 'node', format: 'esm', target: 'node24', metafile: true,
});

const root = resolve('.');
async function packageFor(input) {
  let current = dirname(await realpath(input));
  while (current !== root && dirname(current) !== current) {
    try {
      const manifest = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'));
      if (manifest.name) return { directory: current, name: manifest.name };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    current = dirname(current);
  }
  throw new Error('Missing package metadata for ' + input);
}

const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules')) continue;
  const { directory, name } = await packageFor(input);
  if (notices.has(name)) continue;
  const license = (await readdir(directory)).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
  if (!license) throw new Error('Missing license for ' + name);
  notices.set(name, await readFile(join(directory, license), 'utf8'));
}
await writeFile('dist/THIRD-PARTY-LICENSES.txt',
  [...notices.entries()].map(([name, license]) => name + '\n\n' + license.trim()).join('\n\n') + '\n');
