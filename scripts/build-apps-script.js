import { readFile, writeFile } from 'node:fs/promises';
const core = (await readFile(new URL('../inventory.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
const backend = await readFile(new URL('../apps-script/backend.gs', import.meta.url), 'utf8');
await writeFile(new URL('../apps-script/Code.gs', import.meta.url), '// 自動產生：npm run build:apps-script\n' + core + '\n' + backend);
console.log('已產生 apps-script/Code.gs');
