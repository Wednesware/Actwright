import type { Member } from '../registry/types.ts';

export interface ConnectionCheck { allowed: boolean; warnings: string[] }
function compatible(output: string | null, input: string | null): boolean | null {
  if (!output || !input || ['Any', 'typing.Any'].includes(output) || ['Any', 'typing.Any'].includes(input)) return null;
  if (output === input || input === 'object' || output === 'bool' && input === 'int') return true;
  const primitives = ['int', 'float', 'bool', 'str', 'bytes', 'list', 'dict', 'tuple', 'set'];
  if (primitives.includes(output) && primitives.includes(input)) return false;
  return null; // Custom subclasses, unions, generics, forward references need Python.
}
export function validateConnection(output: Member, input: Member, mode: 'framework' | 'strict' = 'framework'): ConnectionCheck {
  if (output.kind !== 'output' || input.kind !== 'input') return { allowed: false, warnings: ['Expected output → input'] };
  const warnings: string[] = [];
  if (input.parameters.length === 1 && output.returns && !['None', 'NoneType'].includes(output.returns)) {
    const checked = compatible(output.returns, input.parameters[0]!.annotation);
    if (checked === false) return { allowed: false, warnings: ['Silicon rejects this annotated output-return/input type pair'] };
    if (checked === null) warnings.push('Connection-time type compatibility requires local Python validation');
  }
  const fixedOutput = output.parameters.filter(p => !p.kind.startsWith('var'));
  const fixedInput = input.parameters.filter(p => !p.kind.startsWith('var'));
  const variadic = [...output.parameters, ...input.parameters].some(p => p.kind.startsWith('var'));
  if (!variadic && fixedOutput.length < fixedInput.filter(p => p.default.kind === 'missing').length) warnings.push('Output may not supply all required input arguments');
  if (!variadic && fixedOutput.length > fixedInput.length) warnings.push('Output may supply too many arguments');
  for (let index = 0; index < Math.min(fixedOutput.length, fixedInput.length); index++) {
    if (compatible(fixedOutput[index]!.annotation, fixedInput[index]!.annotation) === false) warnings.push(`Payload parameter ${index + 1} has incompatible annotations`);
  }
  return { allowed: mode === 'framework' || warnings.length === 0, warnings };
}
