import {copyFile} from 'node:fs/promises';
await copyFile('.build/worker.js','dist/_worker.js');
