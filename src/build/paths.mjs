import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootFolder = fileURLToPath(new URL('../../', import.meta.url));
export const buildFolder = path.join(rootFolder, 'dist');
