import { readFileSync } from 'node:fs';
import { workspacePython, type PythonWorkspace } from '../frontend/src/scripting/blocks.ts';
const workspaces = JSON.parse(readFileSync(0, 'utf-8')) as PythonWorkspace[];
process.stdout.write(JSON.stringify(workspaces.map(workspacePython)));
