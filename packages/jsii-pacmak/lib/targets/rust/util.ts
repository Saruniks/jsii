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
  as: 'as_',
  break: 'break_',
  const: 'const_',
  continue: 'continue_',
  crate: 'crate_',
  else: 'else_',
  enum: 'enum_',
  extern: 'extern_',
  false: 'false_',
  fn: 'fn_',
  for: 'for_',
  if: 'if_',
  impl: 'impl_',
  in: 'in_',
  let: 'let_',
  loop: 'loop_',
  match: 'match_',
  mod: 'mod_',
  move: 'move_',
  mut: 'mut_',
  pub: 'pub_',
  ref: 'ref_',
  return: 'return_',
  self: 'self_',
  Self: 'Self_',
  static: 'static_',
  struct: 'struct_',
  super: 'super_',
  trait: 'trait_',
  true: 'true_',
  type: 'type_',
  unsafe: 'unsafe_',
  use: 'use_',
  where: 'where_',
  while: 'while_',
  async: 'async_',
  await: 'await_',
  dyn: 'dyn_',
  abstract: 'abstract_',
  become: 'become_',
  box: 'box_',
  do: 'do_',
  final: 'final_',
  macro: 'macro_',
  override: 'override_',
  priv: 'priv_',
  typeof: 'typeof_',
  unsized: 'unsized_',
  virtual: 'virtual_',
  yield: 'yield_',
  try: 'try_',
  macro_rules: 'macro_rules_',
  union: 'union_',
  safe: 'safe_',
  raw: 'raw_',
  gen: 'gen_',
};

export function makeRustPropertyName(propertyName: string): string {
  propertyName = propertyName.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return substituteReservedWords(propertyName.toLowerCase());
}

export function substituteReservedWords(name: string): string {
  return RESERVED_WORDS[name] || name;
}

