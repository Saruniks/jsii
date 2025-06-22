import { Assembly } from "jsii-reflect";

/**
 * Computes a safe tarball name for the provided assembly.
 *
 * @param assm the assembly.
 *
 * @returns a tarball name.
 */
export function tarballName(assm: Assembly): string {
  const name = assm.name.replace(/^@/, '').replace(/\//g, '-');
  return `${name}-${assm.version}.tgz`;
}

const RESERVED_WORDS: { [word: string]: string } = {
  self: 'self_',
};

export function substituteReservedWords(name: string): string {
  return RESERVED_WORDS[name] || name;
}

