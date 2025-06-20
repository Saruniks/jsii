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
