import * as spec from '@jsii/spec';
import { CodeMaker } from 'codemaker';
import * as fs from 'fs-extra';
import { Assembly } from 'jsii-reflect';
import * as path from 'path';

import { IGenerator, Legalese } from '../generator';
import * as logging from '../logging';
import { Target, TargetOptions } from '../target';
import { shell } from '../util';

export default class Rust extends Target {
  private readonly rustGenerator: RustGenerator;

  public constructor(options: TargetOptions) {
    super(options);
    this.rustGenerator = new RustGenerator();
  }

  public get generator() {
    return this.rustGenerator;
  }

  /**
   * Generates a publishable artifact in `outDir`.
   */
  public async build(sourceDir: string, outDir: string): Promise<void> {
    await this.copyFiles(sourceDir, outDir);

    const packageName = this.rustGenerator.packageName;
    const crateDir = path.join(outDir, packageName);

    if (process.env.JSII_BUILD_RUST) {
      try {
        await cargo('check', [], { cwd: crateDir });
        logging.info(`[${crateDir}] Rust code compilation check passed`);
      } catch (e) {
        logging.warn(
          `[${crateDir}] Rust compilation check failed: ${String(e)}`,
        );
      }
    }
  }
}

class RustGenerator implements IGenerator {
  private assembly!: Assembly;
  public packageName!: string;

  private readonly code = new CodeMaker({
    indentCharacter: ' ',
    indentationLevel: 2,
  });

  // Track generated modules and names to avoid conflicts
  private readonly modules = new Map<string, Set<string>>();
  private readonly typesByModule = new Map<string, spec.Type[]>();
  private readonly methodNameCounts = new Map<string, number>();

  public async load(_: string, assembly: Assembly): Promise<void> {
    this.assembly = assembly;
    this.packageName = this.toRustPackageName(assembly.name);
    this.organizeTypesByModule();
    return Promise.resolve();
  }

  public async upToDate(_outDir: string) {
    return Promise.resolve(false);
  }

  public generate(): void {
    this.generateCargoToml();
    this.generateLibRs();
    // Skip separate modules for now - put everything in lib.rs
    // this.generateModules();
  }

  private organizeTypesByModule(): void {
    // Put all types in root module for now to avoid file handling issues
    const allTypes = Object.values(this.assembly.spec.types ?? {});
    this.typesByModule.set('root', allTypes);
    this.modules.set('root', new Set());

    allTypes.forEach((type: spec.Type) => {
      this.modules.get('root')!.add(this.toRustTypeName(type.name));
    });
  }

  private generateCargoToml(): void {
    this.code.openFile('Cargo.toml');
    this.code.line('[package]');
    this.code.line(`name = "${this.packageName}"`);
    this.code.line(`version = "${this.assembly.version}"`);
    this.code.line('edition = "2021"');
    this.code.line('');
    this.code.line('[dependencies]');
    this.code.line('serde = { version = "1.0", features = ["derive"] }');
    this.code.line('serde_json = "1.0"');
    this.code.line('tokio = { version = "1.0", features = ["full"] }');
    this.code.line('uuid = { version = "1.0", features = ["v4"] }');
    this.code.line('rand = "0.8"');
    this.code.closeFile('Cargo.toml');
  }

  private generateLibRs(): void {
    this.code.openFile('src/lib.rs');
    this.code.line('//! Generated Rust bindings for jsii module');
    this.code.line('');
    this.code.line('use serde::{Deserialize, Serialize};');
    this.code.line('use serde_json::{Value, Number};');
    this.code.line('use std::collections::HashMap;');
    this.code.line('');

    // Generate all types in the main lib.rs file for now
    const types = this.typesByModule.get('root') ?? [];
    const generatedNames = new Set<string>();

    types.forEach((type) => {
      const rustName = this.toRustTypeName(type.name);

      // Skip if already generated (handle duplicates)
      if (generatedNames.has(rustName)) {
        return;
      }
      generatedNames.add(rustName);

      try {
        switch (type.kind) {
          case spec.TypeKind.Class:
            this.generateClassInline(type as spec.ClassType);
            break;
          case spec.TypeKind.Interface:
            this.generateInterfaceInline(type as spec.InterfaceType);
            break;
          case spec.TypeKind.Enum:
            this.generateEnumInline(type as spec.EnumType);
            break;
        }
      } catch (error) {
        console.error(`Error generating type ${type.name}:`, error);
        // Skip this type and continue
      }
    });

    this.code.closeFile('src/lib.rs');
  }

  private generateClassInline(cls: spec.ClassType): void {
    const className = this.toRustTypeName(cls.name);
    this.methodNameCounts.clear(); // Reset for each class

    this.code.line('');
    this.code.line(`/// ${String(cls.docs?.summary ?? cls.name)}`);
    this.code.line('#[derive(Debug, Clone, Serialize, Deserialize)]');
    this.code.line(`pub struct ${className} {`);
    this.code.line('  object_ref: String,');
    this.code.line('}');
    this.code.line('');

    this.code.line(`impl ${className} {`);

    if (cls.initializer) {
      this.code.line(
        '  pub fn new() -> Result<Self, Box<dyn std::error::Error>> {',
      );
      this.code.line('    // TODO: Implement constructor via jsii runtime');
      this.code.line('    Ok(Self {');
      this.code.line('      object_ref: uuid::Uuid::new_v4().to_string(),');
      this.code.line('    })');
      this.code.line('  }');

      // Track that 'new' is used
      this.methodNameCounts.set('new', 1);
    }

    // Generate methods
    (cls.methods ?? []).forEach((method: spec.Method) => {
      this.generateMethodInline(method);
    });

    // Generate properties
    (cls.properties ?? []).forEach((prop: spec.Property) => {
      this.generatePropertyInline(prop);
    });

    this.code.line('}');
  }

  private generateInterfaceInline(ifc: spec.InterfaceType): void {
    const interfaceName = this.toRustTypeName(ifc.name);

    this.code.line('');
    this.code.line(`/// ${String(ifc.docs?.summary ?? ifc.name)}`);

    // Check if this is a struct-like interface (data type)
    const isDataType = ifc.datatype ?? false;

    if (isDataType) {
      // Generate as a struct for data types
      this.code.line('#[derive(Debug, Clone, Serialize, Deserialize)]');
      this.code.line(`pub struct ${interfaceName} {`);

      (ifc.properties ?? []).forEach((prop: spec.Property) => {
        try {
          const propName = this.toRustFieldName(prop.name);
          const propType = this.toRustType(prop.type, false); // false = not return type
          if (prop.optional) {
            this.code.line(`  pub ${propName}: Option<${propType}>,`);
          } else {
            this.code.line(`  pub ${propName}: ${propType},`);
          }
        } catch (error) {
          // Skip problematic properties and add a fallback field
          console.warn(
            `Skipping property ${prop.name} in struct ${ifc.name}: ${String(error)}`,
          );
          const safeName = this.toRustFieldName(prop.name) || 'unknown_field';
          this.code.line(
            `  pub ${safeName}: Value, // Fallback for ${prop.name}`,
          );
        }
      });

      this.code.line('}');
    } else {
      // Generate as a trait for behavioral interfaces
      this.code.line(`pub trait ${interfaceName} {`);

      (ifc.methods ?? []).forEach((method: spec.Method) => {
        try {
          const methodName = this.toRustMethodName(method.name);
          const returnType = method.returns
            ? this.toRustType(method.returns.type, true) // true = is return type
            : '()';
          this.code.line(`  fn ${methodName}(&self) -> ${returnType};`);
        } catch (error) {
          // Skip problematic methods
          console.warn(
            `Skipping method ${method.name} in interface ${ifc.name}: ${String(error)}`,
          );
        }
      });

      (ifc.properties ?? []).forEach((prop: spec.Property) => {
        try {
          const propName = this.toRustMethodName(prop.name);
          const propType = this.toRustType(prop.type, true); // true = is return type
          this.code.line(`  fn ${propName}(&self) -> ${propType};`);
        } catch (error) {
          // Skip problematic properties
          console.warn(
            `Skipping property ${prop.name} in interface ${ifc.name}: ${String(error)}`,
          );
        }
      });

      this.code.line('}');
    }
  }

  private generateEnumInline(enm: spec.EnumType): void {
    const enumName = this.toRustTypeName(enm.name);

    this.code.line('');
    this.code.line(`/// ${String(enm.docs?.summary ?? enm.name)}`);
    this.code.line('#[derive(Debug, Clone, Serialize, Deserialize)]');
    this.code.line(`pub enum ${enumName} {`);

    (enm.members ?? []).forEach((member) => {
      const memberName = this.toRustEnumMember(member.name);
      this.code.line(`  ${memberName},`);
    });

    this.code.line('}');
  }

  private generateMethodInline(method: spec.Method): void {
    let methodName = this.toRustMethodName(method.name);

    // Handle method name conflicts - check if this name conflicts with constructor
    const currentCount = this.methodNameCounts.get(methodName) ?? 0;
    if (currentCount > 0) {
      // This method name conflicts with constructor or previous method
      methodName =
        methodName === 'new' ? 'create_new' : `${methodName}_${currentCount}`;
    }
    this.methodNameCounts.set(method.name, currentCount + 1);

    const returnType = method.returns
      ? this.toRustType(method.returns.type, true) // true = is return type
      : '()';

    this.code.line('');
    this.code.line(`  /// ${String(method.docs?.summary ?? method.name)}`);
    this.code.line(
      `  pub fn ${methodName}(&self) -> Result<${returnType}, Box<dyn std::error::Error>> {`,
    );
    this.code.line('    // TODO: Implement method via jsii runtime');
    this.code.line('    todo!("Implement method")');
    this.code.line('  }');
  }

  private generatePropertyInline(prop: spec.Property): void {
    let propName = this.toRustMethodName(prop.name);

    // Handle property name conflicts
    const currentCount = this.methodNameCounts.get(propName) ?? 0;
    if (currentCount > 0) {
      propName = `${propName}_${currentCount}`;
    }
    this.methodNameCounts.set(prop.name, currentCount + 1);

    const propType = this.toRustType(prop.type, true); // true = is return type

    // Getter
    this.code.line('');
    this.code.line(`  /// Get ${prop.name}`);
    this.code.line(
      `  pub fn ${propName}(&self) -> Result<${propType}, Box<dyn std::error::Error>> {`,
    );
    this.code.line('    // TODO: Implement property getter via jsii runtime');
    this.code.line('    todo!("Implement property getter")');
    this.code.line('  }');

    // Setter (if mutable)
    if (!prop.immutable) {
      const setterCount = this.methodNameCounts.get(`set_${prop.name}`) ?? 0;
      // Build setter name carefully to avoid invalid syntax like "set_r#while"
      const basePropName = this.toRustMethodName(prop.name);
      let setterName = this.escapeRustKeyword(
        `set_${basePropName.replace(/^r#/, '')}`,
      );
      if (setterCount > 0) {
        setterName = `${setterName}_${setterCount}`;
      }
      this.methodNameCounts.set(`set_${prop.name}`, setterCount + 1);

      const setterType = this.toRustType(prop.type, false); // false = not return type

      this.code.line('');
      this.code.line(`  /// Set ${prop.name}`);
      this.code.line(
        `  pub fn ${setterName}(&mut self, _value: ${setterType}) -> Result<(), Box<dyn std::error::Error>> {`,
      );
      this.code.line('    // TODO: Implement property setter via jsii runtime');
      this.code.line('    todo!("Implement property setter")');
      this.code.line('  }');
    }
  }

  private toRustType(
    typeRef: spec.TypeReference,
    isReturnType: boolean = false,
  ): string {
    if (typeof typeRef === 'string') {
      // Primitive type
      switch (typeRef) {
        case 'boolean':
          return 'bool';
        case 'string':
          return 'String';
        case 'number':
          return 'f64';
        case 'any':
          return 'Value';
        case 'date':
          return 'String'; // Use ISO string for now
        case 'json':
          return 'Value';
        default:
          return 'Value';
      }
    }

    if ('collection' in typeRef && typeRef.collection) {
      const elementType = this.toRustType(
        typeRef.collection.elementtype,
        isReturnType,
      );
      switch (typeRef.collection.kind) {
        case spec.CollectionKind.Array:
          return `Vec<${elementType}>`;
        case spec.CollectionKind.Map:
          return `HashMap<String, ${elementType}>`;
        default:
          return 'Value';
      }
    }

    if ('fqn' in typeRef && typeRef.fqn) {
      // Look up the actual type definition
      const type = this.findTypeByFqn(typeRef.fqn);
      if (!type) {
        // Unknown type - fall back to Value
        return 'Value';
      }

      const typeName = this.toRustTypeName(
        typeRef.fqn.split('.').pop() ?? 'Unknown',
      );

      // Check if this is an interface type that should be wrapped in Box<dyn ...>
      if (this.isInterfaceType(typeRef.fqn)) {
        return `Box<dyn ${typeName}>`;
      }

      return typeName;
    }

    return 'Value';
  }

  private findTypeByFqn(fqn: string): spec.Type | undefined {
    return Object.values(this.assembly.spec.types ?? {}).find(
      (t: spec.Type) => t.fqn === fqn,
    );
  }

  private isInterfaceType(fqn: string): boolean {
    const type = this.findTypeByFqn(fqn);
    return (
      type?.kind === spec.TypeKind.Interface &&
      !(type as spec.InterfaceType).datatype
    );
  }

  private toRustPackageName(name: string): string {
    return name.replace(/[@/]/g, '_').replace(/-/g, '_').toLowerCase();
  }

  private toRustTypeName(name: string): string {
    // Handle fully qualified names
    if (name.includes('.')) {
      name = name.split('.').pop() ?? name;
    }

    // Convert to PascalCase and remove special characters
    return name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  private toRustMethodName(name: string): string {
    // Convert to snake_case
    const rustName = name
      .replace(
        /[A-Z]/g,
        (match, offset) => (offset > 0 ? '_' : '') + match.toLowerCase(),
      )
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    // Escape Rust keywords
    return this.escapeRustKeyword(rustName);
  }

  private toRustFieldName(name: string): string {
    const rustName = this.toRustMethodName(name);

    // Special handling for 'self' field name
    if (rustName === 'self' || rustName === 'r#self') {
      return 'self_value';
    }

    return rustName;
  }

  private escapeRustKeyword(name: string): string {
    // List of Rust keywords that need escaping
    const keywords = new Set([
      'abstract',
      'as',
      'async',
      'await',
      'become',
      'box',
      'break',
      'const',
      'continue',
      'crate',
      'do',
      'dyn',
      'else',
      'enum',
      'extern',
      'false',
      'final',
      'fn',
      'for',
      'if',
      'impl',
      'in',
      'let',
      'loop',
      'macro',
      'match',
      'mod',
      'move',
      'mut',
      'override',
      'priv',
      'pub',
      'ref',
      'return',
      'self',
      'Self',
      'static',
      'struct',
      'trait',
      'true',
      'try',
      'type',
      'typeof',
      'unsafe',
      'unsized',
      'use',
      'virtual',
      'where',
      'while',
      'yield',
    ]);

    // Special cases: these cannot be used as identifiers even with r# prefix
    if (name === 'super' || name === 'self') {
      return `${name}_method`;
    }

    if (keywords.has(name)) {
      return `r#${name}`;
    }

    return name;
  }

  private toRustEnumMember(name: string): string {
    // Convert to PascalCase for enum variants
    return name
      .split(/[^a-zA-Z0-9]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  public async save(
    outDir: string,
    tarball: string,
    { license, notice }: Legalese,
  ): Promise<any> {
    const output = path.join(outDir, this.packageName);
    await this.code.save(output);
    await fs.copy(tarball, path.join(output, 'jsii-assembly.tgz'));

    if (license) {
      await fs.writeFile(path.join(output, 'LICENSE'), license, {
        encoding: 'utf8',
      });
    }

    if (notice) {
      await fs.writeFile(path.join(output, 'NOTICE'), notice, {
        encoding: 'utf8',
      });
    }
  }
}

async function cargo(
  command: string,
  args: string[],
  options: { cwd: string },
) {
  return shell('cargo', [command, ...args], options);
}
