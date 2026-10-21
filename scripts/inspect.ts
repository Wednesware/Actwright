import { readFileSync } from 'node:fs';
import { builtins } from '../frontend/src/core/registry/registry.ts';
import { parseProject, validateProject } from '../frontend/src/core/validation/project.ts';
import { analyzeMetadataSummary } from './summary.ts';

const registry = builtins();
const [command = 'catalog', argument = ''] = process.argv.slice(2);
try {
  if (command === 'catalog') console.log(analyzeMetadataSummary(registry.list(argument)));
  else if (command === 'check' && argument) {
    const project = parseProject(JSON.parse(readFileSync(argument, 'utf8')));
    const diagnostics = validateProject(project, registry);
    console.log(JSON.stringify({ name: project.name, components: project.game.order.length, diagnostics }, null, 2));
    if (diagnostics.some(d => d.severity === 'error')) process.exitCode = 1;
  } else throw new Error('Usage: node scripts/inspect.ts catalog [query] | check path/to/project.json');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
