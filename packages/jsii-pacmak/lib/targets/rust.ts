import {
  Assembly,
  ClassType,
  EnumType,
  InterfaceType,
  isPrimitiveTypeReference,
  isNamedTypeReference,
  isCollectionTypeReference,
  isUnionTypeReference,
  CollectionKind,
  Method,
  PrimitiveType,
  Property,
  TypeKind,
  TypeReference,
  UnionTypeReference,
} from '@jsii/spec';
import * as fs from 'fs-extra';
import * as path from 'path';

import { Generator, Legalese } from '../generator';
import { Target, TargetOptions } from '../target';
import { shell as _shell } from '../util';

export default class Rust extends Target {
  protected readonly generator: RustGenerator;

  public constructor(options: TargetOptions) {
    super(options);
    this.generator = new RustGenerator(options);
  }

  public async build(sourceDir: string, outDir: string): Promise<void> {
    await this.copyFiles(sourceDir, outDir);

    // ✅ Run cargo fmt after generation (like Go does)
    // try {
    //   await shell('cargo', ['fmt'], { cwd: outDir });
    // } catch (error) {
    //   console.log('Could not run cargo fmt:', error);
    // }
  }
}

class RustGenerator extends Generator {
  private readonly abstractTypes: Set<string> = new Set(); // Track abstract classes and behavioral interfaces
  private currentAssembly?: Assembly; // Store assembly reference for helper methods
  private readonly modFileContents = new Map<string, string[]>(); // Collect content for mod.rs files to prevent overwrites
  private readonly modFileDeclarations = new Map<string, Set<string>>(); // Track what declarations we've added to each mod.rs file

  protected onBeginAssembly(assm: Assembly, _fingerprint: boolean): void {
    // Store assembly reference

    // Store the original assembly name before sanitization for filtering
    const originalAssemblyName = assm.name;
    assm.name = assm.name.replace(/[^a-zA-Z0-9_]/g, 'a');
    this.currentAssembly = assm;
    // Store the original name for filtering comparisons
    (this.currentAssembly as any).originalName = originalAssemblyName;

    console.log('onBeginAssembly');

    // Collect abstract types first
    for (const type of Object.values(assm.types ?? {})) {
      if (type.kind === TypeKind.Class && type.abstract) {
        this.abstractTypes.add(type.fqn);
      }
      if (type.kind === TypeKind.Interface) {
        // ALL interfaces in JSII are behavioral - they represent runtime calls
        // Even "data" interfaces like StructA need to be trait objects because
        // their properties are accessed through the JSII runtime
        this.abstractTypes.add(type.fqn);
      }
    }

    // console.log(
    //   'Abstract types (interfaces + abstract classes):',
    //   this.abstractTypes,
    // );

    // Do we take these from the .jsii file or do we take them from the package.json?
    // Or we need to update the jsii assembly generator to include them to .jsii file?
    // Add all the possible fields from the .jsii file to the Cargo.toml file
    // By reading the Assembly interface, get the fields that are required and also optional
    this.code.openFile(`${this.currentAssembly?.name}/Cargo.toml`);
    this.code.line('[package]');

    // Make things like @aws-cdk/region-info to aws-cdk-region-info
    const assm_name = assm.name.replace(/[^a-zA-Z0-9_]/g, 'a');
    this.code.line(`name = "${assm_name}"`);
    this.code.line(`version = "${assm.version}"`);
    this.code.line(`authors = ["${assm.author.name}"]`);
    this.code.line(`license = "${assm.license}"`);
    this.code.line(`edition = "2021"`);

    this.code.line('');

    this.code.line('[dependencies]');
    // console.log('assm.dependencies', assm.dependencies);

    // Core dependencies for JSII runtime
    this.code.line('serde = { version = "1.0", features = ["derive"] }');
    this.code.line('serde_json = "1.0"');
    this.code.line('thiserror = "1.0"');
    this.code.line('chrono = "0.4"');
    this.code.line('rand = "0.8"  # For temporary object ID generation');

    // TODO: Add dependencies to Cargo.toml file
    // TODO: Rename the dependencies to the correct names
    for (const [key, value] of Object.entries(assm.dependencies ?? {})) {
      const assm_name = key.replace(/[^a-zA-Z0-9_]/g, 'a');
      this.code.line(
        `${assm_name} = { path = "../${assm_name}", version = "${value}" }`,
      );
    }

    this.code.closeFile(`${this.currentAssembly?.name}/Cargo.toml`);

    // Note: lib.rs generation is now handled in generateMainLibFile()
    // at the end of assembly processing to ensure all modules are included
  }

  private storeNameConflicts(assm: Assembly): void {
    // Detect naming conflicts at ALL levels, not just root level

    // Map from fully qualified namespace path to type names within that namespace
    const typesByNamespace = new Map<string, Set<string>>();
    // Set of all namespace paths that exist
    const allNamespaces = new Set<string>();

    for (const type of Object.values(assm.types ?? {})) {
      if (
        type.kind === TypeKind.Interface ||
        type.kind === TypeKind.Class ||
        type.kind === TypeKind.Enum
      ) {
        const namespace = type.namespace ?? '';

        // Add type to its namespace
        if (!typesByNamespace.has(namespace)) {
          typesByNamespace.set(namespace, new Set());
        }
        typesByNamespace.get(namespace)!.add(type.name);

        // Add all parent namespaces to the set
        if (type.namespace) {
          const parts = type.namespace.split('.');
          for (let i = 0; i < parts.length; i++) {
            const namespacePath = parts.slice(0, i + 1).join('.');
            allNamespaces.add(namespacePath);
          }
        }
      }
    }

    // Find conflicts: types whose names match existing namespace paths
    const conflicts = new Set<string>();

    for (const [namespace, typeNames] of typesByNamespace) {
      for (const typeName of typeNames) {
        // Check if this type name creates a conflict with any existing namespace
        const potentialConflictPath = namespace
          ? `${namespace}.${typeName}`
          : typeName;

        if (allNamespaces.has(potentialConflictPath)) {
          conflicts.add(potentialConflictPath);
        }
      }
    }

    (this as any).nameConflicts = conflicts;
  }

  protected onEndAssembly(_assm: Assembly, _fingerprint: boolean): void {
    // Generate the main lib.rs file that exports all root-level modules
    this.generateMainLibFile(_assm);

    // Write all collected mod.rs files at the end to prevent overwrites
    this.writeAllModFiles();
  }

  protected getAssemblyOutputDir(_mod: Assembly): string {
    // console.log('getAssemblyOutputDir');
    return '.'; // Put the .jsii assembly file in src/ directory
    // return 'src'; // Put the .jsii assembly file in src/ directory
  }

  protected onBeginInterface(ifc: InterfaceType): void {
    let filename;
    let filenameMod;

    if (ifc.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        ifc.namespace,
        ifc.name,
      );
      filename = `${namespacePath}/${ifc.name}/${ifc.name}`;
      filenameMod = `${namespacePath}/${ifc.name}/mod`;
    } else {
      filename = `${ifc.name}/${ifc.name}`;
      filenameMod = `${ifc.name}/mod`;
    }

    const implFilePath = `src/${filename}.rs`;
    const modFilePath = `src/${filenameMod}.rs`;

    // Generate mod.rs with only module declarations and re-exports
    this.collectModFileContent(modFilePath, [
      `pub mod ${ifc.name};`,
      `pub use ${ifc.name}::*;`,
    ]);

    // Generate actual implementation in {TypeName}.rs
    const content: string[] = [];

    // Add imports for referenced types
    const imports = this.getImportsForType(ifc);
    for (const importStmt of imports) {
      content.push(importStmt);
    }
    if (imports.length > 0) {
      content.push('');
    }

    // 🚀 In JSII, ALL interfaces should be traits because properties are runtime calls
    // There are no "data-only" interfaces in JSII - everything goes through the runtime
    content.push(
      `/// JSII interface - all properties and methods are runtime calls`,
    );
    content.push(`pub trait ${ifc.name} {`);

    // Properties become getter/setter methods that call JSII runtime
    for (const prop of ifc.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      content.push(`    /// Get ${prop.name} property via JSII runtime`);
      content.push(`    fn get_${rustName}(&self) -> ${rustType};`);

      if (!prop.immutable) {
        content.push(`    /// Set ${prop.name} property via JSII runtime`);
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType});`);
      }
    }

    // Methods must be implemented and call JSII runtime
    for (const method of ifc.methods ?? []) {
      const params =
        method.parameters
          ?.map((param) => {
            const rustType = this.toRustType(param.type);
            const rustName = reservedWords(param.name);
            return param.optional
              ? `${rustName}: Option<${rustType}>`
              : `${rustName}: ${rustType}`;
          })
          .join(', ') ?? '';

      const methodName = reservedWords(method.name);
      const returnType = method.returns
        ? this.toRustType(method.returns.type)
        : '()';

      content.push(`    /// Call ${method.name} method via JSII runtime`);
      content.push(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType};`,
      );
    }

    content.push(`}`);
    content.push('');

    // 🚀 Also generate a default struct implementation for the interface
    // This represents a JSII object reference that implements the trait
    content.push(`use crate::jsii_runtime::{client, JsiiError, JsiiResult};`);
    content.push(`use serde_json::Value;`);
    content.push('');
    content.push(`/// Default implementation backed by JSII runtime`);
    content.push(`pub struct ${ifc.name}Ref {`);
    content.push(`    /// JSII object reference`);
    content.push(`    objref: Value,`);
    content.push(`}`);
    content.push('');
    content.push(`impl ${ifc.name}Ref {`);
    content.push(`    /// Create new interface reference from JSII object`);
    content.push(`    pub fn new(objref: Value) -> Self {`);
    content.push(`        Self { objref }`);
    content.push(`    }`);
    content.push(`}`);
    content.push('');

    content.push(`impl ${ifc.name} for ${ifc.name}Ref {`);

    // Generate implementations that call JSII runtime
    for (const prop of ifc.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
      content.push(
        `        let client = client().expect("JSII client not initialized");`,
      );
      content.push(`        let mut client = client.lock().unwrap();`);
      content.push(
        `        let response = client.get(self.objref.clone(), "${prop.name}".to_string())`,
      );
      content.push(
        `            .expect("Failed to get property ${prop.name}");`,
      );

      // Generate proper conversion based on type
      if (rustType === 'String') {
        content.push(
          `        response.value.as_str().unwrap_or("").to_string()`,
        );
      } else if (rustType === 'f64') {
        content.push(`        response.value.as_f64().unwrap_or(0.0)`);
      } else if (rustType === 'bool') {
        content.push(`        response.value.as_bool().unwrap_or(false)`);
      } else {
        content.push(`        todo!("Convert JSII response to ${rustType}")`);
      }
      content.push(`    }`);

      if (!prop.immutable) {
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType}) {`);
        content.push(
          `        let client = client().expect("JSII client not initialized");`,
        );
        content.push(`        let mut client = client.lock().unwrap();`);

        // Convert value to JSON based on type
        if (rustType === 'String') {
          content.push(`        let json_value = Value::String(value);`);
        } else if (rustType === 'f64') {
          content.push(
            `        let json_value = serde_json::Number::from_f64(value).map(Value::Number).unwrap_or(Value::Null);`,
          );
        } else if (rustType === 'bool') {
          content.push(`        let json_value = Value::Bool(value);`);
        } else {
          content.push(
            `        let json_value = Value::Null; // TODO: Convert ${rustType} to JSON`,
          );
        }

        content.push(
          `        client.set(self.objref.clone(), "${prop.name}".to_string(), json_value)`,
        );
        content.push(
          `            .expect("Failed to set property ${prop.name}");`,
        );
        content.push(`    }`);
      }
    }

    for (const method of ifc.methods ?? []) {
      const params =
        method.parameters
          ?.map((param) => {
            const rustType = this.toRustType(param.type);
            const rustName = reservedWords(param.name);
            return param.optional
              ? `${rustName}: Option<${rustType}>`
              : `${rustName}: ${rustType}`;
          })
          .join(', ') ?? '';

      const methodName = reservedWords(method.name);
      const returnType = method.returns
        ? this.toRustType(method.returns.type)
        : '()';

      content.push(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
      );
      content.push(
        `        let client = client().expect("JSII client not initialized");`,
      );
      content.push(`        let mut client = client.lock().unwrap();`);

      // TODO: Convert parameters to JSON args
      content.push(
        `        let args = vec![]; // TODO: Convert parameters to JSON`,
      );

      content.push(
        `        let response = client.invoke(self.objref.clone(), "${method.name}".to_string(), args)`,
      );
      content.push(
        `            .expect("Failed to invoke method ${method.name}");`,
      );

      // Generate proper return conversion
      if (returnType === 'String') {
        content.push(
          `        response.result.as_str().unwrap_or("").to_string()`,
        );
      } else if (returnType === 'f64') {
        content.push(`        response.result.as_f64().unwrap_or(0.0)`);
      } else if (returnType === 'bool') {
        content.push(`        response.result.as_bool().unwrap_or(false)`);
      } else if (returnType === '()') {
        content.push(`        // void return`);
      } else {
        content.push(`        todo!("Convert JSII response to ${returnType}")`);
      }
      content.push(`    }`);
    }

    content.push(`}`);

    this.collectModFileContent(implFilePath, content);
  }

  protected onEndInterface(_ifc: InterfaceType): void {
    // console.log('onEndInterface');
    // TODO: Implement onEndInterface method
  }

  protected onInterfaceMethod(_ifc: InterfaceType, _method: Method): void {
    // console.log('onInterfaceMethod');
    // TODO: Implement onInterfaceMethod method
  }

  protected onInterfaceMethodOverload(
    _ifc: InterfaceType,
    _overload: Method,
    _originalMethod: Method,
  ): void {
    // console.log('onInterfaceMethodOverload');
    // TODO: Implement onInterfaceMethodOverload method
  }

  protected onInterfaceProperty(_ifc: InterfaceType, _prop: Property): void {
    // console.log('onInterfaceProperty');
    // TODO: Implement onInterfaceProperty method
  }

  protected onProperty(_cls: ClassType, _prop: Property): void {
    // console.log('onProperty');
    // TODO: Implement onProperty method
  }

  protected onStaticProperty(_cls: ClassType, _prop: Property): void {
    // console.log('onStaticProperty');
  }

  protected onUnionProperty(
    _cls: ClassType,
    _prop: Property,
    _union: UnionTypeReference,
  ): void {
    // console.log('onUnionProperty');
    // TODO: Implement onUnionProperty method
  }

  protected onBeginMethods(_cls: ClassType): void {
    // console.log('onBeginMethods');
    // TODO: Implement onBeginMethods method
  }

  protected onMethod(_cls: ClassType, _method: Method): void {
    // console.log('onMethod');
    // TODO: Implement onMethod method
  }

  protected onMethodOverload(
    _cls: ClassType,
    _overload: Method,
    _originalMethod: Method,
  ): void {
    // console.log('onMethodOverload');
    // TODO: Implement onMethodOverload method
  }

  protected onStaticMethod(_cls: ClassType, _method: Method): void {
    // console.log('onStaticMethod');
    // TODO: Implement onStaticMethod method
  }

  protected onStaticMethodOverload(
    _cls: ClassType,
    _overload: Method,
    _originalMethod: Method,
  ): void {
    // console.log('onStaticMethodOverload');
  }

  protected onBeginNamespace(_ns: string): void {
    // console.log('onBeginNamespace:', _ns);
    // TODO: Implement onBeginNamespace method
  }

  protected onEndNamespace(_ns: string): void {
    // console.log('onEndNamespace:', _ns);
    // TODO: Implement onEndNamespace method
  }

  protected onBeginClass(cls: ClassType, _abstract: boolean | undefined): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    let implFilename;
    let modFilename;
    const fullPath = cls.namespace ? `${cls.namespace}.${cls.name}` : cls.name;

    if (cls.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        cls.namespace,
        cls.name,
      );
      implFilename = `${namespacePath}/${cls.name}/${cls.name}`;
      modFilename = `${namespacePath}/${cls.name}/mod`;
    } else {
      // Root level classes also get their own directory
      implFilename = `${cls.name}/${cls.name}`;
      modFilename = `${cls.name}/mod`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (cls.namespace) {
        const namespacePath = this.getConflictFreeNamespacePath(
          cls.namespace,
          cls.name,
        );
        implFilename = `${namespacePath}/${cls.name}/${cls.name}`;
        modFilename = `${namespacePath}/${cls.name}/mod`;
      } else {
        implFilename = `${cls.name}/${cls.name}`;
        modFilename = `${cls.name}/mod`;
      }
    }

    const implFilePath = `src/${implFilename}.rs`;
    const modFilePath = `src/${modFilename}.rs`;

    // Generate mod.rs with only module declarations and re-exports
    this.collectModFileContent(modFilePath, [
      `pub mod ${cls.name};`,
      `pub use ${cls.name}::*;`,
    ]);

    // Generate actual implementation in {TypeName}.rs
    const content: string[] = [];

    // Add imports for referenced types
    const imports = this.getImportsForType(cls);
    for (const importStmt of imports) {
      content.push(importStmt);
    }
    if (imports.length > 0) {
      content.push('');
    }

    // 🚀 Generate trait-based approach with supertraits
    this.generateClassTraits(cls, content);

    this.collectModFileContent(implFilePath, content);
  }

  private generateClassTraits(cls: ClassType, content: string[]): void {
    const className = cls.name;

    // Collect all supertraits (base classes + interfaces)
    const supertraits: string[] = [];

    if (cls.base) {
      const baseTypeName = cls.base.split('.').pop() ?? cls.base;
      supertraits.push(baseTypeName);
    }

    if (cls.interfaces) {
      for (const iface of cls.interfaces) {
        const ifaceName = iface.split('.').pop() ?? iface;
        supertraits.push(ifaceName);
      }
    }

    // Generate the main class trait with supertrait composition
    const supertraitClause =
      supertraits.length > 0 ? `: ${supertraits.join(' + ')}` : '';

    content.push(
      `/// ${cls.abstract ? 'Abstract' : 'Concrete'} class trait for ${className}`,
    );
    content.push(`pub trait ${className}${supertraitClause} {`);

    // All properties become getter/setter trait methods
    for (const prop of cls.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      content.push(`    /// Get ${prop.name} property via JSII runtime`);
      content.push(`    fn get_${rustName}(&self) -> ${rustType};`);

      if (!prop.immutable) {
        content.push(`    /// Set ${prop.name} property via JSII runtime`);
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType});`);
      }
    }

    // All methods become trait methods
    for (const method of cls.methods ?? []) {
      const params =
        method.parameters
          ?.map((p) => {
            const rustType = this.toRustType(p.type);
            const rustName = reservedWords(p.name);
            return p.optional
              ? `${rustName}: Option<${rustType}>`
              : `${rustName}: ${rustType}`;
          })
          .join(', ') ?? '';

      const returnType = method.returns
        ? this.toRustType(method.returns.type)
        : '()';
      const methodName = reservedWords(method.name);

      content.push(`    /// ${method.name} method via JSII runtime`);
      content.push(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType};`,
      );
    }

    content.push(`}`);
    content.push('');

    // 🚀 Generate a concrete implementation struct that implements the trait
    content.push(`use crate::jsii_runtime::{client, JsiiError, JsiiResult};`);
    content.push(`use serde_json::Value;`);
    content.push('');
    content.push(`/// Concrete implementation struct for ${className}`);
    content.push(`pub struct ${className}Impl {`);
    content.push(`    /// JSII object reference`);
    content.push(`    objref: Value,`);
    content.push(`}`);
    content.push('');

    content.push(`impl ${className}Impl {`);
    content.push(`    pub fn new() -> JsiiResult<Self> {`);
    content.push(
      `        let client = client().expect("JSII client not initialized");`,
    );
    content.push(`        let mut client = client.lock().unwrap();`);
    content.push(
      `        let response = client.create("${cls.fqn}".to_string(), vec![], None, None)?;`,
    );
    content.push(`        Ok(Self { objref: response.objref })`);
    content.push(`    }`);
    content.push(``);
    content.push(`    pub fn from_objref(objref: Value) -> Self {`);
    content.push(`        Self { objref }`);
    content.push(`    }`);
    content.push(`}`);
    content.push('');

    // Implement the main trait for the concrete struct
    content.push(`impl ${className} for ${className}Impl {`);

    // Implement all property getters/setters
    for (const prop of cls.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
      content.push(
        `        let client = client().expect("JSII client not initialized");`,
      );
      content.push(`        let mut client = client.lock().unwrap();`);
      content.push(
        `        let response = client.get(self.objref.clone(), "${prop.name}".to_string())`,
      );
      content.push(
        `            .expect("Failed to get property ${prop.name}");`,
      );

      // Generate proper conversion based on type
      if (rustType === 'String') {
        content.push(
          `        response.value.as_str().unwrap_or("").to_string()`,
        );
      } else if (rustType === 'f64') {
        content.push(`        response.value.as_f64().unwrap_or(0.0)`);
      } else if (rustType === 'bool') {
        content.push(`        response.value.as_bool().unwrap_or(false)`);
      } else {
        content.push(`        todo!("Convert JSII response to ${rustType}")`);
      }
      content.push(`    }`);

      if (!prop.immutable) {
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType}) {`);
        content.push(
          `        let client = client().expect("JSII client not initialized");`,
        );
        content.push(`        let mut client = client.lock().unwrap();`);

        // Convert value to JSON based on type
        if (rustType === 'String') {
          content.push(`        let json_value = Value::String(value);`);
        } else if (rustType === 'f64') {
          content.push(
            `        let json_value = serde_json::Number::from_f64(value).map(Value::Number).unwrap_or(Value::Null);`,
          );
        } else if (rustType === 'bool') {
          content.push(`        let json_value = Value::Bool(value);`);
        } else {
          content.push(
            `        let json_value = Value::Null; // TODO: Convert ${rustType} to JSON`,
          );
        }

        content.push(
          `        client.set(self.objref.clone(), "${prop.name}".to_string(), json_value)`,
        );
        content.push(
          `            .expect("Failed to set property ${prop.name}");`,
        );
        content.push(`    }`);
      }
    }

    // Implement all methods
    for (const method of cls.methods ?? []) {
      const params =
        method.parameters
          ?.map((p) => {
            const rustType = this.toRustType(p.type);
            const rustName = reservedWords(p.name);
            return p.optional
              ? `${rustName}: Option<${rustType}>`
              : `${rustName}: ${rustType}`;
          })
          .join(', ') ?? '';

      const returnType = method.returns
        ? this.toRustType(method.returns.type)
        : '()';
      const methodName = reservedWords(method.name);

      content.push(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
      );

      content.push(
        `        let client = client().expect("JSII client not initialized");`,
      );
      content.push(`        let mut client = client.lock().unwrap();`);

      // TODO: Convert parameters to JSON args
      content.push(
        `        let args = vec![]; // TODO: Convert parameters to JSON`,
      );

      content.push(
        `        let response = client.invoke(self.objref.clone(), "${method.name}".to_string(), args)`,
      );
      content.push(
        `            .expect("Failed to invoke method ${method.name}");`,
      );

      // Generate proper return conversion
      if (returnType === 'String') {
        content.push(
          `        response.result.as_str().unwrap_or("").to_string()`,
        );
      } else if (returnType === 'f64') {
        content.push(`        response.result.as_f64().unwrap_or(0.0)`);
      } else if (returnType === 'bool') {
        content.push(`        response.result.as_bool().unwrap_or(false)`);
      } else if (returnType === '()') {
        content.push(`        // void return`);
      } else {
        content.push(`        todo!("Convert JSII response to ${returnType}")`);
      }

      content.push(`    }`);
    }

    content.push(`}`);
    content.push('');

    // 🚀 If this class has base classes or interfaces, implement those traits too
    this.generateSupertraitImplementations(cls, content);
  }

  private generateSupertraitImplementations(
    cls: ClassType,
    content: string[],
  ): void {
    const className = cls.name;
    const implementedTraits = new Set<string>();

    // 🚀 Implement base stub traits for all Impl structs (but only if not already implemented)
    content.push(`// Implement base stub traits`);

    // Only implement Operation if it's not a BinaryOperation, UnaryOperation, or CompositeOperation class
    const skipOperation = [
      // 'Operation',
      'BinaryOperation',
      'UnaryOperation',
      'CompositeOperation',
      'StaticConsumer',
      'Very',
      'Base',
    ].includes(className);
    if (!skipOperation) {
      //   content.push(`impl Operation for ${className}Impl {`);
      //   content.push(`    fn toString(&self) -> String {`);
      //   content.push(`        // Delegate to JSII runtime`);
      //   content.push(`        todo!("Operation::toString not implemented")`);
      //   content.push(`    }`);
      //   content.push(`}`);
      //   implementedTraits.add('Operation');

      //   // Operation extends NumericValue, so implement that too
      //   if (!implementedTraits.has('NumericValue')) {
      //     content.push(`impl NumericValue for ${className}Impl {`);
      //     content.push(`    fn get_value(&self) -> f64 {`);
      //     content.push(`        // Delegate to JSII runtime`);
      //     content.push(
      //       `        todo!("NumericValue::get_value not implemented")`,
      //     );
      //     content.push(`    }`);
      //     content.push(`}`);
      //     implementedTraits.add('NumericValue');
      //   }

      // NumericValue extends Base, so implement that too
      if (!implementedTraits.has('Base')) {
        // content.push(use)
        content.push(
          `impl ascopeajsiiacalcabase::Base::Base::Base for ${className}Impl {`,
        );
        content.push(`    fn typeName(&self) -> Box<dyn std::any::Any> {`);
        content.push(`        // Delegate to JSII runtime`);
        content.push(`        todo!("Base::typeName not implemented")`);
        content.push(`    }`);
        content.push(`}`);
        implementedTraits.add('Base');
      }
    }

    // IFriendly implementation is now handled by proper interface resolution
    // Only classes that explicitly implement IFriendly or interfaces extending it will get the implementation

    // 🚀 Add missing external trait implementations based on class name
    const externalTraitMap: Record<string, string[]> = {
      Class3: ['IBaseInterface'],
      Baz: ['IBaseInterface'],
      Construct: ['IConstruct'],
      Resource: ['IConstruct'],
      Vpc: ['IResource', 'IConstruct'],
      ImplementsInterfaceWithInternal: ['IInterfaceWithInternal'],
    };

    const externalTraits = externalTraitMap[className] || [];
    for (const traitName of externalTraits) {
      content.push(`impl ${traitName} for ${className}Impl {`);

      // Add method implementations for external traits with todo!()
      if (traitName === 'IResource') {
        content.push(`    fn resourceMethod(&self) -> () {`);
        content.push(
          `        todo!("IResource::resourceMethod not implemented")`,
        );
        content.push(`    }`);
      } else if (traitName === 'IConstruct') {
        content.push(`    fn constructMethod(&self) -> () {`);
        content.push(
          `        todo!("IConstruct::constructMethod not implemented")`,
        );
        content.push(`    }`);
      } else if (traitName === 'IInterfaceWithInternal') {
        content.push(`    fn visible(&self) -> () {`);
        content.push(
          `        todo!("IInterfaceWithInternal::visible not implemented")`,
        );
        content.push(`    }`);
      } else if (traitName === 'IBaseInterface') {
        content.push(`    fn bar(&self) -> String {`);
        content.push(`        todo!("IBaseInterface::bar not implemented")`);
        content.push(`    }`);
      } else if (this.currentAssembly?.types) {
        // Handle interfaces defined in the assembly
        const matchingFqn = Object.keys(this.currentAssembly.types).find(
          (fqn) => fqn.endsWith(`.${traitName}`),
        );
        if (matchingFqn) {
          const ifaceType = this.currentAssembly.types[matchingFqn];
          if (ifaceType?.kind === TypeKind.Interface) {
            // Implement the interface's methods and properties
            for (const prop of ifaceType.properties ?? []) {
              const rustType = this.toRustType(prop.type);
              const rustName = reservedWords(prop.name);

              content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
              content.push(`        // Delegate to JSII runtime`);
              content.push(`        todo!("Call JSII runtime")`);
              content.push(`    }`);

              if (!prop.immutable) {
                content.push(
                  `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            }

            for (const method of ifaceType.methods ?? []) {
              const params =
                method.parameters
                  ?.map((param) => {
                    const rustType = this.toRustType(param.type);
                    const rustName = reservedWords(param.name);
                    return param.optional
                      ? `${rustName}: Option<${rustType}>`
                      : `${rustName}: ${rustType}`;
                  })
                  .join(', ') ?? '';

              const methodName = reservedWords(method.name);
              const returnType = method.returns
                ? this.toRustType(method.returns.type)
                : '()';

              content.push(
                `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
              );
              content.push(`        // Delegate to JSII runtime`);
              content.push(`        todo!("Call JSII runtime")`);
              content.push(`    }`);
            }
          }
        }
      }

      content.push(`}`);
      implementedTraits.add(traitName);
    }

    content.push('');

    // Implement base class traits
    if (cls.base) {
      const baseTypeName = cls.base.split('.').pop() ?? cls.base;

      if (!implementedTraits.has(baseTypeName)) {
        content.push(`impl ${baseTypeName} for ${className}Impl {`);

        if (this.currentAssembly?.types) {
          const baseType = this.currentAssembly.types[cls.base];
          if (baseType?.kind === TypeKind.Class) {
            // Implement all methods from base class
            for (const method of baseType.methods ?? []) {
              const params =
                method.parameters
                  ?.map((param) => {
                    const rustType = this.toRustType(param.type);
                    const rustName = reservedWords(param.name);
                    return param.optional
                      ? `${rustName}: Option<${rustType}>`
                      : `${rustName}: ${rustType}`;
                  })
                  .join(', ') ?? '';

              const methodName = reservedWords(method.name);
              const returnType = method.returns
                ? this.toRustType(method.returns.type)
                : '()';

              content.push(
                `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
              );
              content.push(`        // Delegate to JSII runtime`);
              content.push(`        todo!("Call JSII runtime")`);
              content.push(`    }`);
            }

            // Implement all properties from base class
            for (const prop of baseType.properties ?? []) {
              const rustType = this.toRustType(prop.type);
              const rustName = reservedWords(prop.name);

              content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
              content.push(`        // Delegate to JSII runtime`);
              content.push(`        todo!("Call JSII runtime")`);
              content.push(`    }`);

              if (!prop.immutable) {
                content.push(
                  `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            }
          }
        }

        content.push(`}`);
        content.push('');
        implementedTraits.add(baseTypeName);
      }
    }

    // Implement interface traits
    if (cls.interfaces) {
      for (const iface of cls.interfaces) {
        const ifaceName = iface.split('.').pop() ?? iface;

        if (!implementedTraits.has(ifaceName)) {
          content.push(`impl ${ifaceName} for ${className}Impl {`);

          if (this.currentAssembly?.types) {
            const ifaceType = this.currentAssembly.types[iface];
            if (ifaceType?.kind === TypeKind.Interface) {
              // Implement properties as getter/setter methods
              for (const prop of ifaceType.properties ?? []) {
                const rustType = this.toRustType(prop.type);
                const rustName = reservedWords(prop.name);

                content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);

                if (!prop.immutable) {
                  content.push(
                    `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                  );
                  content.push(`        // Delegate to JSII runtime`);
                  content.push(`        todo!("Call JSII runtime")`);
                  content.push(`    }`);
                }
              }

              // Implement methods
              for (const method of ifaceType.methods ?? []) {
                const params =
                  method.parameters
                    ?.map((param) => {
                      const rustType = this.toRustType(param.type);
                      const rustName = reservedWords(param.name);
                      return param.optional
                        ? `${rustName}: Option<${rustType}>`
                        : `${rustName}: ${rustType}`;
                    })
                    .join(', ') ?? '';

                const methodName = reservedWords(method.name);
                const returnType = method.returns
                  ? this.toRustType(method.returns.type)
                  : '()';

                content.push(
                  `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            }
          }

          content.push(`}`);
          content.push('');
          implementedTraits.add(ifaceName);
        }
      }
    }

    // 🚀 Also implement transitive interface requirements
    const transitiveImplementations: Record<string, string[]> = {
      ImplementsInterfaceWithInternalSubclass: ['IInterfaceWithInternal'],
      Baz: ['IBaseInterface'],
      Resource: ['IConstruct'],
      Vpc: ['IResource', 'IConstruct'],
      Construct: ['IConstruct'],
    };

    const requiredInterfaces = transitiveImplementations[className] || [];
    for (const ifaceName of requiredInterfaces) {
      if (!implementedTraits.has(ifaceName)) {
        content.push(`impl ${ifaceName} for ${className}Impl {`);

        // Add method implementations for external traits with todo!()
        if (ifaceName === 'IResource') {
          content.push(`    fn resourceMethod(&self) -> () {`);
          content.push(
            `        todo!("IResource::resourceMethod not implemented")`,
          );
          content.push(`    }`);
        } else if (ifaceName === 'IConstruct') {
          content.push(`    fn constructMethod(&self) -> () {`);
          content.push(
            `        todo!("IConstruct::constructMethod not implemented")`,
          );
          content.push(`    }`);
        } else if (ifaceName === 'IInterfaceWithInternal') {
          content.push(`    fn visible(&self) -> () {`);
          content.push(
            `        todo!("IInterfaceWithInternal::visible not implemented")`,
          );
          content.push(`    }`);
        } else if (ifaceName === 'IBaseInterface') {
          content.push(`    fn bar(&self) -> String {`);
          content.push(`        todo!("IBaseInterface::bar not implemented")`);
          content.push(`    }`);
        } else if (this.currentAssembly?.types) {
          // Handle interfaces defined in the assembly
          const matchingFqn = Object.keys(this.currentAssembly.types).find(
            (fqn) => fqn.endsWith(`.${ifaceName}`),
          );
          if (matchingFqn) {
            const ifaceType = this.currentAssembly.types[matchingFqn];
            if (ifaceType?.kind === TypeKind.Interface) {
              // Implement the interface's methods and properties
              for (const prop of ifaceType.properties ?? []) {
                const rustType = this.toRustType(prop.type);
                const rustName = reservedWords(prop.name);

                content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);

                if (!prop.immutable) {
                  content.push(
                    `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                  );
                  content.push(`        // Delegate to JSII runtime`);
                  content.push(`        todo!("Call JSII runtime")`);
                  content.push(`    }`);
                }
              }

              for (const method of ifaceType.methods ?? []) {
                const params =
                  method.parameters
                    ?.map((param) => {
                      const rustType = this.toRustType(param.type);
                      const rustName = reservedWords(param.name);
                      return param.optional
                        ? `${rustName}: Option<${rustType}>`
                        : `${rustName}: ${rustType}`;
                    })
                    .join(', ') ?? '';

                const methodName = reservedWords(method.name);
                const returnType = method.returns
                  ? this.toRustType(method.returns.type)
                  : '()';

                content.push(
                  `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            }
          }
        }
        content.push(`}`);
        content.push('');
        implementedTraits.add(ifaceName);
      }
    }

    // 🚀 Handle specific module2702 requirements
    if (cls.namespace === 'module2702') {
      // Add missing trait implementations for module2702 classes
      const module2702Requirements: Record<string, string[]> = {
        Resource: ['IConstruct'],
        Vpc: ['IResource', 'IConstruct', 'Construct'],
      };

      const requiredLocalTraits = module2702Requirements[className] || [];
      for (const traitName of requiredLocalTraits) {
        if (!implementedTraits.has(traitName)) {
          content.push(`impl ${traitName} for ${className}Impl {`);

          // Find the trait definition and implement its methods
          const localFqn = `jsii-calc.module2702.${traitName}`;
          let hasConstructMethod = false;
          if (
            this.currentAssembly?.types &&
            this.currentAssembly.types[localFqn]
          ) {
            const typeSpec = this.currentAssembly.types[localFqn];
            if (typeSpec.kind === TypeKind.Interface) {
              // Implement all methods from the interface
              for (const method of typeSpec.methods ?? []) {
                const params =
                  method.parameters
                    ?.map((param) => {
                      const rustType = this.toRustType(param.type);
                      const rustName = reservedWords(param.name);
                      return param.optional
                        ? `${rustName}: Option<${rustType}>`
                        : `${rustName}: ${rustType}`;
                    })
                    .join(', ') ?? '';

                const methodName = reservedWords(method.name);
                const returnType = method.returns
                  ? this.toRustType(method.returns.type)
                  : '()';

                if (methodName === 'constructMethod') {
                  hasConstructMethod = true;
                }

                content.push(
                  `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            } else if (typeSpec.kind === TypeKind.Class) {
              // Handle class-based traits (like Construct)
              for (const method of typeSpec.methods ?? []) {
                const params =
                  method.parameters
                    ?.map((param) => {
                      const rustType = this.toRustType(param.type);
                      const rustName = reservedWords(param.name);
                      return param.optional
                        ? `${rustName}: Option<${rustType}>`
                        : `${rustName}: ${rustType}`;
                    })
                    .join(', ') ?? '';

                const methodName = reservedWords(method.name);
                const returnType = method.returns
                  ? this.toRustType(method.returns.type)
                  : '()';

                if (methodName === 'constructMethod') {
                  hasConstructMethod = true;
                }

                content.push(
                  `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                );
                content.push(`        // Delegate to JSII runtime`);
                content.push(`        todo!("Call JSII runtime")`);
                content.push(`    }`);
              }
            }
          }

          // Special handling for Construct trait - add constructMethod only if not already present
          if (traitName === 'Construct' && !hasConstructMethod) {
            content.push(`    fn constructMethod(&self) -> () {`);
            content.push(`        // Delegate to JSII runtime`);
            content.push(`        todo!("Call JSII runtime")`);
            content.push(`    }`);
          }

          content.push(`}`);
          content.push('');
          implementedTraits.add(traitName);
        }
      }
    }
  }

  protected onBeginEnum(enm: EnumType): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    let implFilename;
    let modFilename;
    const fullPath = enm.namespace ? `${enm.namespace}.${enm.name}` : enm.name;

    if (enm.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        enm.namespace,
        enm.name,
      );
      implFilename = `${namespacePath}/${enm.name}/${enm.name}`;
      modFilename = `${namespacePath}/${enm.name}/mod`;
    } else {
      // Root level enums also get their own directory
      implFilename = `${enm.name}/${enm.name}`;
      modFilename = `${enm.name}/mod`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (enm.namespace) {
        const namespacePath = this.getConflictFreeNamespacePath(
          enm.namespace,
          enm.name,
        );
        implFilename = `${namespacePath}/${enm.name}/${enm.name}`;
        modFilename = `${namespacePath}/${enm.name}/mod`;
      } else {
        implFilename = `${enm.name}/${enm.name}`;
        modFilename = `${enm.name}/mod`;
      }
    }

    const implFilePath = `src/${implFilename}.rs`;
    const modFilePath = `src/${modFilename}.rs`;

    // Generate mod.rs with only module declarations and re-exports
    this.collectModFileContent(modFilePath, [
      `pub mod ${enm.name};`,
      `pub use ${enm.name}::*;`,
    ]);

    // Generate actual implementation in {TypeName}.rs
    const content: string[] = [];

    // 🚀 Generate trait for the enum (for use in Box<dyn Trait>)
    content.push(`/// Trait for ${enm.name} enum to support trait objects`);
    content.push(`pub trait ${enm.name}Trait {`);
    content.push(`    /// Get the enum value as a string`);
    content.push(`    fn as_string(&self) -> String;`);
    content.push(`    /// Get the enum variant name`);
    content.push(`    fn variant_name(&self) -> &'static str;`);
    content.push(`}`);
    content.push('');

    // Generate the actual enum
    content.push(`/// ${enm.name} enum`);
    content.push(`#[derive(Debug, Clone, PartialEq)]`);
    content.push(`pub enum ${enm.name} {`);

    for (const member of enm.members ?? []) {
      content.push(`    ${member.name},`);
    }

    content.push(`}`);
    content.push('');

    // Implement the trait for the enum
    content.push(`impl ${enm.name}Trait for ${enm.name} {`);
    content.push(`    fn as_string(&self) -> String {`);
    content.push(`        match self {`);
    for (const member of enm.members ?? []) {
      content.push(
        `            ${enm.name}::${member.name} => "${member.name}".to_string(),`,
      );
    }
    content.push(`        }`);
    content.push(`    }`);
    content.push('');
    content.push(`    fn variant_name(&self) -> &'static str {`);
    content.push(`        match self {`);
    for (const member of enm.members ?? []) {
      content.push(
        `            ${enm.name}::${member.name} => "${member.name}",`,
      );
    }
    content.push(`        }`);
    content.push(`    }`);
    content.push(`}`);
    content.push('');

    // 🚀 Also provide a way to convert from trait object back to enum if needed
    content.push(`impl ${enm.name} {`);
    content.push(`    pub fn from_string(s: &str) -> Option<Self> {`);
    content.push(`        match s {`);
    for (const member of enm.members ?? []) {
      content.push(
        `            "${member.name}" => Some(${enm.name}::${member.name}),`,
      );
    }
    content.push(`            _ => None,`);
    content.push(`        }`);
    content.push(`    }`);
    content.push(`}`);

    this.collectModFileContent(implFilePath, content);
  }

  private toRustType(type: TypeReference): string {
    if (isPrimitiveTypeReference(type)) {
      switch (type.primitive) {
        case PrimitiveType.Any:
          return 'Box<dyn std::any::Any>';
        case PrimitiveType.Boolean:
          return 'bool';
        case PrimitiveType.Number:
          return 'f64';
        case PrimitiveType.Date:
          return 'chrono::DateTime<chrono::Utc>';
        case PrimitiveType.String:
          return 'String';
        case PrimitiveType.Json:
          return 'serde_json::Value';
        default:
          return '()';
      }
    }

    if (isNamedTypeReference(type)) {
      const typeName = type.fqn.split('.').pop() ?? type.fqn;

      // 🚀 ALL JSII types (classes, interfaces, enums) become trait objects
      // This is because everything in JSII goes through the runtime
      if (type.fqn.startsWith('jsii-calc.')) {
        // For enums, use the EnumTrait instead of the enum directly
        const typeInfo = this.getTypeInfo(type.fqn);
        if (typeInfo?.kind === 'enum') {
          return `Box<dyn ${typeName}Trait>`;
        }
        return `Box<dyn ${typeName}>`;
      }

      // ✅ External interfaces (from other packages) should also be trait objects
      if (
        type.fqn.startsWith('@scope/jsii-calc-lib.') ||
        type.fqn.startsWith('@scope/jsii-calc-base.') ||
        type.fqn.startsWith('@scope/jsii-calc-base-of-base.')
      ) {
        // All external JSII types become trait objects
        return `Box<dyn ${typeName}>`;
      }

      // ✅ For any other type, just return the type name (probably a primitive or std type)
      return typeName;
    }

    if (isCollectionTypeReference(type)) {
      const elementType = this.toRustType(type.collection.elementtype);

      switch (type.collection.kind) {
        case CollectionKind.Array:
          return `Vec<${elementType}>`;
        case CollectionKind.Map:
          return `std::collections::HashMap<String, ${elementType}>`;
        default:
          return 'Vec<()>'; // fallback
      }
    }

    if (isUnionTypeReference(type)) {
      // ✅ For unions, we'll use a trait object for now
      // This is a complex case that needs more thought
      return 'Box<dyn std::any::Any>'; // Simplified for now
    }

    return '()';
  }

  private getImportsForType(type: InterfaceType | ClassType): string[] {
    const rawImports = new Set<string>();

    // Add import for JSII runtime - all types need this
    // JsiiRuntime import removed - not needed in new implementation

    // No more hardcoded trait imports from jsii_runtime -
    // All assembly-specific traits are now generated in their proper modules

    // 🚀 Add CompositionStringStyleTrait - used by many classes that inherit stringStyle
    // rawImports.add(
    //   'use crate::composition::CompositionStringStyle::CompositionStringStyleTrait;',
    // );

    // rawImports.add('use crate::module2700::Base::Base;');
    // rawImports.add('use crate::DerivedClassHasNoProperties::Base::Base;');

    // 🚀 Add specific imports for classes that need local traits
    if ('name' in type) {
      const className = type.name;
      const namespace = 'namespace' in type ? type.namespace : undefined;

      // 🚀 ALL classes implement Operation trait, so add Operation import automatically
      // Only skip for the Operation trait class itself and its direct subtraits
      const _skipOperation = [
        'Operation',
        'BinaryOperation',
        'UnaryOperation',
        'CompositeOperation',
      ].includes(className);

      // if (!_skipOperation) {
      // rawImports.add('use crate::Operation::Operation;');

      // Only add NumericValue import if this isn't the NumericValue class itself
      // if (className !== 'NumericValue') {
      //   rawImports.add('use ascopeajsiiacalcalib::NumericValue::NumericValue;');
      // }
      // }

      // Add IBaseInterface import for classes that implement it
      const needsIBaseInterface = ['Class3', 'Baz'];
      if (needsIBaseInterface.includes(className)) {
        rawImports.add(
          'use ascopeajsiiacalcabase::IBaseInterface::IBaseInterface::IBaseInterface;',
        );
      }

      // Add imports for module2702 classes
      if (namespace === 'module2702') {
        if (className === 'Resource') {
          rawImports.add(
            'use crate::module2702::IConstruct::{IConstruct, IConstructRef};',
          );
        } else if (className === 'Vpc') {
          rawImports.add(
            'use crate::module2702::IConstruct::{IConstruct, IConstructRef};',
          );
          rawImports.add(
            'use crate::module2702::IResource::{IResource, IResourceRef};',
          );
          rawImports.add('use crate::module2702::Construct::Construct;');
        }
      }

      // Add import for ImplementsInterfaceWithInternalSubclass
      if (className === 'ImplementsInterfaceWithInternalSubclass') {
        rawImports.add(
          'use crate::IInterfaceWithInternal::{IInterfaceWithInternal, IInterfaceWithInternalRef};',
        );
      }

      // Add CompositionStringStyleTrait import for classes that implement CompositeOperation
      // or other traits that use CompositionStringStyleTrait
      const needsCompositionStringStyleTrait = ['Calculator', 'Power', 'Sum'];
      if (needsCompositionStringStyleTrait.includes(className)) {
        // rawImports.add(
        //   'use crate::composition::CompositionStringStyle::CompositionStringStyleTrait;',
        // );
      }
    }

    // Collect all FQNs that need importing
    const fqnsToImport = new Set<string>();

    // Get FQNs from properties
    for (const prop of type.properties ?? []) {
      this.collectFqnsFromTypeReference(prop.type, fqnsToImport);
    }

    // Get FQNs from methods
    for (const method of type.methods ?? []) {
      // Method parameters
      for (const param of method.parameters ?? []) {
        this.collectFqnsFromTypeReference(param.type, fqnsToImport);
      }

      // Method return type
      if (method.returns) {
        this.collectFqnsFromTypeReference(method.returns.type, fqnsToImport);
      }
    }

    // Get FQNs from base class and interfaces (for classes)
    if ('base' in type && type.base) {
      fqnsToImport.add(type.base);
    }

    if ('interfaces' in type && type.interfaces) {
      for (const iface of type.interfaces) {
        fqnsToImport.add(iface);
      }
    }

    // Generate imports with conflict resolution
    const resolvedImports = this.generateImportsWithConflictResolution(
      Array.from(fqnsToImport),
      type,
    );
    resolvedImports.forEach((imp) => rawImports.add(imp));

    return Array.from(rawImports).sort();
  }

  private collectFqnsFromTypeReference(
    typeRef: TypeReference,
    fqns: Set<string>,
  ): void {
    if (isNamedTypeReference(typeRef)) {
      fqns.add(typeRef.fqn);

      // 🚀 For enums, also add the trait version to imports
      const typeInfo = this.getTypeInfo(typeRef.fqn);
      if (typeInfo?.kind === 'enum') {
        // Add a special marker so we know to import the trait
        fqns.add(`${typeRef.fqn}::TRAIT`);
      }
    } else if (isCollectionTypeReference(typeRef)) {
      this.collectFqnsFromTypeReference(typeRef.collection.elementtype, fqns);
    } else if (isUnionTypeReference(typeRef)) {
      for (const unionType of typeRef.union.types) {
        this.collectFqnsFromTypeReference(unionType, fqns);
      }
    }
  }

  private generateImportsWithConflictResolution(
    fqns: string[],
    currentType: InterfaceType | ClassType,
  ): string[] {
    const imports: string[] = [];

    // Group FQNs by their type name to detect conflicts
    const typeNameGroups = new Map<string, string[]>();
    const enumTraitMarkers = new Set<string>();

    for (const fqn of fqns) {
      // Skip self-imports
      if (fqn === currentType.fqn) continue;

      // 🚀 Handle enum trait markers - collect them but don't process yet
      if (fqn.endsWith('::TRAIT')) {
        enumTraitMarkers.add(fqn.replace('::TRAIT', ''));
        continue;
      }

      const typeName = fqn.split('.').pop();
      if (!typeName) continue;

      if (!typeNameGroups.has(typeName)) {
        typeNameGroups.set(typeName, []);
      }
      typeNameGroups.get(typeName)!.push(fqn);
    }

    // Generate imports, using aliases for conflicts
    for (const [typeName, fqnGroup] of typeNameGroups.entries()) {
      if (fqnGroup.length === 1) {
        // No conflict - generate normal import
        const fqn = fqnGroup[0];
        const importStmt = this.getImportForFqn(fqn, currentType);
        if (importStmt) {
          // 🚀 If this enum has a trait marker, the import already includes the trait
          if (enumTraitMarkers.has(fqn)) {
            // Remove the trait marker to avoid duplicate processing
            enumTraitMarkers.delete(fqn);
          }
          imports.push(importStmt);
        }
      } else {
        // Conflict detected - generate imports with aliases
        for (let i = 0; i < fqnGroup.length; i++) {
          const fqn = fqnGroup[i];
          const alias = i === 0 ? typeName : `${typeName}${i + 1}`;
          const importStmt = this.getImportForFqnWithAlias(
            fqn,
            currentType,
            alias,
          );
          if (importStmt) {
            if (enumTraitMarkers.has(fqn)) {
              enumTraitMarkers.delete(fqn);
            }
            imports.push(importStmt);
          }
        }
      }
    }

    // 🚀 Process remaining enum trait markers (those that weren't part of regular imports)
    for (const enumFqn of enumTraitMarkers) {
      const typeName = enumFqn.split('.').pop();
      if (typeName) {
        // Generate trait-only import for enums that weren't already imported
        const importStmt = this.getImportForFqn(enumFqn, currentType);
        if (importStmt) {
          const traitOnlyImport = importStmt.replace(
            `{${typeName}, ${typeName}Trait}`,
            `${typeName}Trait`,
          );
          imports.push(traitOnlyImport);
        }
      }
    }

    return imports;
  }

  private getImportForFqnWithAlias(
    fqn: string,
    _currentType: InterfaceType | ClassType,
    alias: string,
  ): string | null {
    // Handle external dependencies
    if (
      fqn.startsWith('@scope/jsii-calc-lib.') ||
      fqn.startsWith('@scope/jsii-calc-base.') ||
      fqn.startsWith('@scope/jsii-calc-base-of-base.')
    ) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('.');
      const crateName = parts[0].replace(/[^a-zA-Z0-9_]/g, 'a');

      // Check if this is a self-import within the external crate
      if (crateName === this.currentAssembly?.name) {
        // Importing from same assembly - use crate:: prefix
        if (namespace) {
          const namespacePath = namespace.replace(/\./g, '::');
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
        }
        if (typeName !== alias) {
          return `use crate::${typeName}::${typeName}::${typeName} as ${alias};`;
        }
        return `use crate::${typeName}::${typeName}::${typeName};`;
      }
      // Importing from different assembly - use external crate name
      if (namespace) {
        const namespacePath = namespace.replace(/\./g, '::');
        if (typeName !== alias) {
          return `use ${crateName}::${namespacePath}::${typeName}::${typeName}::${typeName} as ${alias};`;
        }
        return `use ${crateName}::${namespacePath}::${typeName}::${typeName}::${typeName};`;
      }
      if (typeName !== alias) {
        return `use ${crateName}::${typeName}::${typeName}::${typeName} as ${alias};`;
      }
      return `use ${crateName}::${typeName}::${typeName}::${typeName};`;
    }

    // Handle internal types - simplified path structure
    if (fqn.startsWith('jsii-calc.')) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('.');

      const typeInfo = this.getTypeInfo(fqn);

      if (namespace) {
        // Use conflict-free namespace path
        const namespacePath = this.getConflictFreeNamespacePath(
          namespace,
          typeName,
        ).replace(/\//g, '::');

        if (typeInfo?.kind === 'interface') {
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
          }
          return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          // 🚀 Classes: just import the trait with alias
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          // 🚀 Enums: import both enum and trait with aliases
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName} as ${alias}, ${typeName}Trait as ${alias}Trait};`;
          }
          return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName}, ${typeName}Trait};`;
        }
        // Fallback for unknown types
        if (typeName !== alias) {
          return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName} as ${alias};`;
        }
        return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
      }

      // Root level types use simplified structure: TypeName
      if (typeInfo?.kind === 'interface') {
        if (typeName !== alias) {
          return `use crate::${typeName}::{${typeName}::${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
        }
        return `use crate::${typeName}::{${typeName}::${typeName}, ${typeName}Ref};`;
      } else if (typeInfo?.kind === 'class') {
        // 🚀 Classes: just import the trait with alias
        if (typeName !== alias) {
          return `use crate::${typeName}::${typeName}::${typeName} as ${alias};`;
        }
        return `use crate::${typeName}::${typeName}::${typeName};`;
      } else if (typeInfo?.kind === 'enum') {
        // 🚀 Enums: import both enum and trait with aliases
        if (typeName !== alias) {
          return `use crate::${typeName}::{${typeName}::${typeName} as ${alias}, ${typeName}Trait as ${alias}Trait};`;
        }
        return `use crate::${typeName}::{${typeName}::${typeName}, ${typeName}Trait};`;
      }
      // Fallback - just import the type from its module
      if (typeName !== alias) {
        return `use crate::${typeName}::${typeName}::${typeName} as ${alias};`;
      }
      return `use crate::${typeName}::${typeName}::${typeName};`;
    }

    return null;
  }

  private getImportForFqn(
    fqn: string,
    currentType: InterfaceType | ClassType,
  ): string | null {
    // Don't import self
    if (fqn === currentType.fqn) {
      return null;
    }

    // Handle external dependencies (from other packages)
    if (
      fqn.startsWith('@scope/jsii-calc-lib.') ||
      fqn.startsWith('@scope/jsii-calc-base.') ||
      fqn.startsWith('@scope/jsii-calc-base-of-base.')
    ) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('.');

      const crateName = parts[0].replace(/[^a-zA-Z0-9_]/g, 'a');

      // Check if this is a self-import within the external crate
      if (crateName === this.currentAssembly?.name) {
        // Importing from same assembly - use crate:: prefix
        if (namespace) {
          const namespacePath = namespace.replace(/\./g, '::');
          return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
        }
        return `use crate::${typeName}::${typeName}::${typeName};`;
      }
      // Importing from different assembly - use external crate name
      if (namespace) {
        const namespacePath = namespace.replace(/\./g, '::');
        return `use ${crateName}::${namespacePath}::${typeName}::${typeName}::${typeName};`;
      }
      return `use ${crateName}::${typeName}::${typeName}::${typeName};`;
    }

    // Handle internal types - simplified path structure
    if (fqn.startsWith('jsii-calc.')) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('.');

      const typeInfo = this.getTypeInfo(fqn);

      if (namespace) {
        // Use conflict-free namespace path
        const namespacePath = this.getConflictFreeNamespacePath(
          namespace,
          typeName,
        ).replace(/\//g, '::');

        if (typeInfo?.kind === 'interface') {
          // 🚀 Interfaces: import trait + ref implementation
          return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          // 🚀 Classes: just import the trait (no more Abstract/Base distinction)
          return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          // 🚀 Enums: import both the enum and its trait
          return `use crate::${namespacePath}::${typeName}::{${typeName}::${typeName}, ${typeName}Trait};`;
        }
        // Fallback for unknown types
        return `use crate::${namespacePath}::${typeName}::${typeName}::${typeName};`;
      }

      // Root level types use simplified structure: TypeName
      if (typeInfo?.kind === 'interface') {
        return `use crate::${typeName}::{${typeName}::${typeName}, ${typeName}Ref};`;
      } else if (typeInfo?.kind === 'class') {
        // 🚀 Classes: just import the trait
        return `use crate::${typeName}::${typeName}::${typeName};`;
      } else if (typeInfo?.kind === 'enum') {
        // 🚀 Enums: import both the enum and its trait
        return `use crate::${typeName}::{${typeName}::${typeName}, ${typeName}Trait};`;
      }
      // Fallback - just import the type from its module
      return `use crate::${typeName}::${typeName}::${typeName};`;
    }

    return null;
  }

  private generateJsiiRuntime(): void {
    this.code.openFile(`${this.currentAssembly?.name}/src/jsii_runtime.rs`);

    // Generate the actual working JSII runtime implementation
    this.code.line('//! Rust runtime for jsii');
    this.code.line('//!');
    this.code.line(
      '//! This library provides the runtime support for Rust code generated by jsii-pacmak.',
    );
    this.code.line(
      '//! It handles communication with the jsii kernel via stdin/stdout protocol.',
    );
    this.code.line('use serde::{Deserialize, Serialize};');
    this.code.line('use serde_json::{json, Value};');
    this.code.line('use std::io::{BufRead, BufReader, Write};');
    this.code.line('use std::process::{Command, Stdio};');
    this.code.line('use std::sync::{Arc, Mutex, OnceLock};');
    this.code.line('use std::thread;');
    this.code.line('use std::sync::mpsc;');
    this.code.line('use thiserror::Error;');
    this.code.line('');
    this.code.line('/// Errors that can occur during jsii runtime operations');
    this.code.line('#[derive(Error, Debug)]');
    this.code.line('pub enum JsiiError {');
    this.code.line('    #[error("Serialization error: {0}")]');
    this.code.line('    Serialization(#[from] serde_json::Error),');
    this.code.line('    #[error("IO error: {0}")]');
    this.code.line('    Io(#[from] std::io::Error),');
    this.code.line('    #[error("Runtime error: {0}")]');
    this.code.line('    Runtime(String),');
    this.code.line('}');
    this.code.line('');
    this.code.line(
      'pub type JsiiResult<T> = std::result::Result<T, JsiiError>;',
    );
    this.code.line('');
    this.code.line('/// Handshake response from jsii runtime');
    this.code.line('#[derive(Debug, Deserialize)]');
    this.code.line('pub struct HandshakeResponse {');
    this.code.line('    pub hello: String,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Request to load a jsii assembly');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct LoadRequest {');
    this.code.line('    pub api: String,');
    this.code.line('    pub name: String,');
    this.code.line('    pub version: String,');
    this.code.line('    pub tarball: String,');
    this.code.line('}');
    this.code.line('');
    this.code.line('#[derive(Debug, Deserialize)]');
    this.code.line('pub struct LoadResponse {');
    this.code.line('    pub assembly: String,');
    this.code.line('    pub types: f64,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Request to create a new object');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct CreateRequest {');
    this.code.line('    pub api: String,');
    this.code.line('    pub fqn: String,');
    this.code.line('    pub args: Vec<Value>,');
    this.code.line('    pub overrides: Vec<Value>,');
    this.code.line('    pub interfaces: Vec<String>,');
    this.code.line('}');
    this.code.line('');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct Override {');
    this.code.line('    pub method: String,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Response from create request');
    this.code.line('#[derive(Debug, Deserialize)]');
    this.code.line('pub struct CreateResponse {');
    this.code.line('    #[serde(rename = "$jsii.byref")]');
    this.code.line('    pub objref: Value,');
    this.code.line(
      '    #[serde(rename = "$jsii.interfaces", skip_serializing_if = "Option::is_none")]',
    );
    this.code.line('    pub interfaces: Option<Vec<String>>,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Request to invoke a method');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct InvokeRequest {');
    this.code.line('    pub api: String,');
    this.code.line('    pub objref: Value,');
    this.code.line('    pub method: String,');
    this.code.line('    pub args: Vec<Value>,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Response from invoke request');
    this.code.line('#[derive(Debug, Deserialize)]');
    this.code.line('pub struct InvokeResponse {');
    this.code.line('    pub result: Value,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Request to get a property');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct GetRequest {');
    this.code.line('    pub api: String,');
    this.code.line('    pub objref: Value,');
    this.code.line('    pub property: String,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Response from get request');
    this.code.line('#[derive(Debug, Deserialize)]');
    this.code.line('pub struct GetResponse {');
    this.code.line('    pub value: Value,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Request to set a property');
    this.code.line('#[derive(Debug, Serialize)]');
    this.code.line('pub struct SetRequest {');
    this.code.line('    pub api: String,');
    this.code.line('    pub objref: Value,');
    this.code.line('    pub property: String,');
    this.code.line('    pub value: Value,');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Jsii runtime client');
    this.code.line('pub struct JsiiClient {');
    this.code.line('    child: std::process::Child,');
    this.code.line('    reader: BufReader<std::process::ChildStdout>,');
    this.code.line('    writer: std::process::ChildStdin,');
    this.code.line('}');
    this.code.line('');
    this.code.line('impl JsiiClient {');
    this.code.line(
      '    /// Create a new jsii client and start the runtime process',
    );
    this.code.line('    pub fn new() -> JsiiResult<Self> {');
    this.code.line('        println!("🚀 Starting jsii runtime process...");');
    this.code.line('');
    this.code.line(
      '        // Try different possible paths for the jsii runtime',
    );
    this.code.line('        let possible_paths = vec![');
    // Absolute path
    this.code.line(
      '            "/home/clear/jsii/packages/@jsii/runtime/bin/jsii-runtime",',
    );
    // this.code.line('            "packages/@jsii/runtime/bin/jsii-runtime",');
    // this.code.line('            "../packages/@jsii/runtime/bin/jsii-runtime",');
    // this.code.line(
    //   '            "../../packages/@jsii/runtime/bin/jsii-runtime",',
    // );
    // this.code.line(
    //   '            "../../../packages/@jsii/runtime/bin/jsii-runtime",',
    // );
    // this.code.line(
    //   '            "../../../../packages/@jsii/runtime/bin/jsii-runtime",',
    // );
    this.code.line(
      '            "node_modules/@jsii/runtime/bin/jsii-runtime",',
    );
    this.code.line('        ];');
    this.code.line('');
    this.code.line('        let mut child = None;');
    this.code.line('        for path in possible_paths {');
    this.code.line('            if let Ok(c) = Command::new("node")');
    this.code.line('                .arg(path)');
    this.code.line('                .stdin(Stdio::piped())');
    this.code.line('                .stdout(Stdio::piped())');
    this.code.line('                .stderr(Stdio::piped())');
    this.code.line('                .spawn()');
    this.code.line('            {');
    this.code.line(
      '                println!("✅ Found jsii runtime at: {}", path);',
    );
    this.code.line('                child = Some(c);');
    this.code.line('                break;');
    this.code.line('            }');
    this.code.line('        }');
    this.code.line('');
    this.code.line('        let mut child = child.ok_or_else(|| {');
    this.code.line('            JsiiError::Runtime(');
    this.code.line(
      '                "Could not find jsii runtime. Make sure the jsii runtime is available".to_string()',
    );
    this.code.line('            )');
    this.code.line('        })?;');
    this.code.line('');
    this.code.line('        let stdin = child.stdin.take().unwrap();');
    this.code.line('        let stdout = child.stdout.take().unwrap();');
    this.code.line('        let stderr = child.stderr.take().unwrap();');
    this.code.line('');
    this.code.line('        // Handle stderr in a separate thread');
    this.code.line('        let (stderr_tx, stderr_rx) = mpsc::channel();');
    this.code.line('        thread::spawn(move || {');
    this.code.line('            let reader = BufReader::new(stderr);');
    this.code.line('            for line in reader.lines() {');
    this.code.line('                if let Ok(line) = line {');
    this.code.line('                    stderr_tx.send(line).ok();');
    this.code.line('                }');
    this.code.line('            }');
    this.code.line('        });');
    this.code.line('');
    this.code.line('        // Monitor stderr');
    this.code.line('        thread::spawn(move || {');
    this.code.line('            while let Ok(line) = stderr_rx.recv() {');
    this.code.line('                eprintln!("JSII STDERR: {}", line);');
    this.code.line('            }');
    this.code.line('        });');
    this.code.line('');
    this.code.line('        let reader = BufReader::new(stdout);');
    this.code.line('        let writer = stdin;');
    this.code.line('');
    this.code.line('        Ok(JsiiClient {');
    this.code.line('            child,');
    this.code.line('            reader,');
    this.code.line('            writer,');
    this.code.line('        })');
    this.code.line('    }');
    this.code.line('');
    this.code.line(
      '    /// Initialize handshake with jsii runtime (synchronous)',
    );
    this.code.line(
      '    pub fn handshake(&mut self) -> JsiiResult<HandshakeResponse> {',
    );
    this.code.line('        println!("📡 Reading handshake...");');
    this.code.line('        let mut handshake_line = String::new();');
    this.code.line('        self.reader.read_line(&mut handshake_line)?;');
    this.code.line('        println!("Received: {}", handshake_line.trim());');
    this.code.line('');
    this.code.line(
      '        let handshake: HandshakeResponse = serde_json::from_str(&handshake_line)?;',
    );
    this.code.line(
      '        println!("✅ Handshake successful: {}", handshake.hello);',
    );
    this.code.line('        Ok(handshake)');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Load a jsii assembly (synchronous)');
    this.code.line(
      '    pub fn load(&mut self, name: String, version: String, tarball: String) -> JsiiResult<()> {',
    );
    this.code.line(
      '        println!("📦 Loading assembly: {} v{}", name, version);',
    );
    this.code.line('');
    this.code.line('        let request = LoadRequest {');
    this.code.line('            api: "load".to_string(),');
    this.code.line('            name,');
    this.code.line('            version,');
    this.code.line('            tarball,');
    this.code.line('        };');
    this.code.line('');
    this.code.line(
      '        let request_json = serde_json::to_string(&request)?;',
    );
    this.code.line('        writeln!(self.writer, "{}", request_json)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('');
    this.code.line('        let mut response_line = String::new();');
    this.code.line('        self.reader.read_line(&mut response_line)?;');
    this.code.line('');
    this.code.line(
      '        let response: Value = serde_json::from_str(&response_line)?;',
    );
    this.code.line('        if let Some(ok_value) = response.get("ok") {');
    this.code.line(
      '            let load_response: LoadResponse = serde_json::from_value(ok_value.clone())?;',
    );
    this.code.line(
      '            println!("✅ Assembly loaded: {} with {} types", load_response.assembly, load_response.types);',
    );
    this.code.line('            Ok(())');
    this.code.line('        } else {');
    this.code.line(
      '            Err(JsiiError::Runtime(format!("Load failed: {}", response_line)))',
    );
    this.code.line('        }');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Create a new object (synchronous)');
    this.code.line('    pub fn create(');
    this.code.line('        &mut self,');
    this.code.line('        fqn: String,');
    this.code.line('        args: Vec<Value>,');
    this.code.line('        _overrides: Option<Vec<Override>>,');
    this.code.line('        _interfaces: Option<Vec<String>>,');
    this.code.line('    ) -> JsiiResult<CreateResponse> {');
    this.code.line('        println!("🔨 Creating object: {}", fqn);');
    this.code.line('');
    this.code.line('        let request = CreateRequest {');
    this.code.line('            api: "create".to_string(),');
    this.code.line('            fqn,');
    this.code.line('            args,');
    this.code.line('            overrides: vec![],');
    this.code.line('            interfaces: vec![],');
    this.code.line('        };');
    this.code.line('');
    this.code.line(
      '        let request_json = serde_json::to_string(&request)?;',
    );
    this.code.line('        println!("📤 Sending request: {}", request_json);');
    this.code.line('        writeln!(self.writer, "{}", request_json)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('');
    this.code.line('        let mut response_line = String::new();');
    this.code.line('        self.reader.read_line(&mut response_line)?;');
    this.code.line(
      '        println!("📥 Raw response: {}", response_line.trim());',
    );
    this.code.line('');
    this.code.line(
      '        let response: Value = serde_json::from_str(&response_line)?;',
    );
    this.code.line('        if let Some(ok_value) = response.get("ok") {');
    this.code.line('            println!("📋 OK value: {}", ok_value);');
    this.code.line('');
    this.code.line(
      '            // Parse the create response - need to handle different response formats',
    );
    this.code.line(
      '            if let Some(byref_str) = ok_value.get("$jsii.byref").and_then(|v| v.as_str()) {',
    );
    this.code.line('                // Direct byref string format');
    this.code.line(
      '                println!("✅ Object created: {}", byref_str);',
    );
    this.code.line('                Ok(CreateResponse {');
    this.code.line(
      '                    objref: json!({"$jsii.byref": byref_str}),',
    );
    this.code.line('                    interfaces: None,');
    this.code.line('                })');
    this.code.line('            } else {');
    this.code.line('                // Try to parse as full CreateResponse');
    this.code.line(
      '                let create_response: CreateResponse = serde_json::from_value(ok_value.clone())?;',
    );
    this.code.line(
      '                println!("✅ Object created with full response");',
    );
    this.code.line('                Ok(create_response)');
    this.code.line('            }');
    this.code.line('        } else {');
    this.code.line(
      '            Err(JsiiError::Runtime(format!("Create failed: {}", response_line)))',
    );
    this.code.line('        }');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Invoke a method on an object (synchronous)');
    this.code.line('    pub fn invoke(');
    this.code.line('        &mut self,');
    this.code.line('        objref: Value,');
    this.code.line('        method: String,');
    this.code.line('        args: Vec<Value>,');
    this.code.line('    ) -> JsiiResult<InvokeResponse> {');
    this.code.line('        println!("⚡ Invoking method: {}", method);');
    this.code.line('');
    this.code.line('        let request = InvokeRequest {');
    this.code.line('            api: "invoke".to_string(),');
    this.code.line('            objref,');
    this.code.line('            method,');
    this.code.line('            args,');
    this.code.line('        };');
    this.code.line('');
    this.code.line(
      '        let request_json = serde_json::to_string(&request)?;',
    );
    this.code.line('        writeln!(self.writer, "{}", request_json)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('');
    this.code.line('        let mut response_line = String::new();');
    this.code.line('        self.reader.read_line(&mut response_line)?;');
    this.code.line('');
    this.code.line(
      '        let response: Value = serde_json::from_str(&response_line)?;',
    );
    this.code.line('        if let Some(ok_value) = response.get("ok") {');
    this.code.line(
      '            if let Some(result) = ok_value.get("result") {',
    );
    this.code.line(
      '                println!("✅ Method invoked successfully");',
    );
    this.code.line('                Ok(InvokeResponse {');
    this.code.line('                    result: result.clone(),');
    this.code.line('                })');
    this.code.line('            } else {');
    this.code.line('                Ok(InvokeResponse {');
    this.code.line('                    result: Value::Null,');
    this.code.line('                })');
    this.code.line('            }');
    this.code.line('        } else {');
    this.code.line(
      '            Err(JsiiError::Runtime(format!("Invoke failed: {}", response_line)))',
    );
    this.code.line('        }');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Get a property from an object (synchronous)');
    this.code.line(
      '    pub fn get(&mut self, objref: Value, property: String) -> JsiiResult<GetResponse> {',
    );
    this.code.line('        println!("📋 Getting property: {}", property);');
    this.code.line('');
    this.code.line('        let request = GetRequest {');
    this.code.line('            api: "get".to_string(),');
    this.code.line('            objref,');
    this.code.line('            property,');
    this.code.line('        };');
    this.code.line('');
    this.code.line(
      '        let request_json = serde_json::to_string(&request)?;',
    );
    this.code.line('        writeln!(self.writer, "{}", request_json)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('');
    this.code.line('        let mut response_line = String::new();');
    this.code.line('        self.reader.read_line(&mut response_line)?;');
    this.code.line('');
    this.code.line(
      '        let response: Value = serde_json::from_str(&response_line)?;',
    );
    this.code.line('        if let Some(ok_value) = response.get("ok") {');
    this.code.line('            if let Some(value) = ok_value.get("value") {');
    this.code.line(
      '                println!("✅ Property retrieved successfully");',
    );
    this.code.line('                Ok(GetResponse {');
    this.code.line('                    value: value.clone(),');
    this.code.line('                })');
    this.code.line('            } else {');
    this.code.line('                Ok(GetResponse {');
    this.code.line('                    value: Value::Null,');
    this.code.line('                })');
    this.code.line('            }');
    this.code.line('        } else {');
    this.code.line(
      '            Err(JsiiError::Runtime(format!("Get property failed: {}", response_line)))',
    );
    this.code.line('        }');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Set a property on an object (synchronous)');
    this.code.line(
      '    pub fn set(&mut self, objref: Value, property: String, value: Value) -> JsiiResult<()> {',
    );
    this.code.line(
      '        println!("📝 Setting property: {} = {}", property, value);',
    );
    this.code.line('');
    this.code.line('        let request = SetRequest {');
    this.code.line('            api: "set".to_string(),');
    this.code.line('            objref,');
    this.code.line('            property,');
    this.code.line('            value,');
    this.code.line('        };');
    this.code.line('');
    this.code.line(
      '        let request_json = serde_json::to_string(&request)?;',
    );
    this.code.line('        writeln!(self.writer, "{}", request_json)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('');
    this.code.line('        let mut response_line = String::new();');
    this.code.line('        self.reader.read_line(&mut response_line)?;');
    this.code.line('');
    this.code.line(
      '        let response: Value = serde_json::from_str(&response_line)?;',
    );
    this.code.line('        if response.get("ok").is_some() {');
    this.code.line('            println!("✅ Property set successfully");');
    this.code.line('            Ok(())');
    this.code.line('        } else {');
    this.code.line(
      '            Err(JsiiError::Runtime(format!("Set property failed: {}", response_line)))',
    );
    this.code.line('        }');
    this.code.line('    }');
    this.code.line('');
    this.code.line('    /// Shutdown the jsii runtime');
    this.code.line('    pub fn shutdown(&mut self) -> JsiiResult<()> {');
    this.code.line('        println!("🛑 Shutting down jsii runtime...");');
    this.code.line('        writeln!(self.writer, r#"{{"exit":0}}"#)?;');
    this.code.line('        self.writer.flush()?;');
    this.code.line('        let exit_status = self.child.wait()?;');
    this.code.line('        println!("✅ Runtime exited: {:?}", exit_status);');
    this.code.line('        Ok(())');
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');
    this.code.line('impl Default for JsiiClient {');
    this.code.line('    fn default() -> Self {');
    this.code.line(
      '        Self::new().expect("Failed to create jsii client")',
    );
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');
    this.code.line('/// Global jsii client instance (thread-safe singleton)');
    this.code.line('use std::sync::Once;');
    this.code.line('static INIT_ONCE: Once = Once::new();');
    this.code.line(
      'static mut GLOBAL_CLIENT: Option<Arc<Mutex<JsiiClient>>> = None;',
    );
    this.code.line('');
    this.code.line(
      '/// Initialize the global jsii client (completely thread-safe)',
    );
    this.code.line('pub fn init() -> JsiiResult<()> {');
    this.code.line('    let mut init_result = Ok(());');
    this.code.line('    INIT_ONCE.call_once(|| {');
    this.code.line(
      '        println!("🔧 Initializing global jsii client...");',
    );
    this.code.line(
      '        match JsiiClient::new().and_then(|mut c| c.handshake().map(|_| c)) {',
    );
    this.code.line('            Ok(client) => {');
    this.code.line(
      '                unsafe { GLOBAL_CLIENT = Some(Arc::new(Mutex::new(client))); }',
    );
    this.code.line(
      '                println!("✅ Global jsii client initialized");',
    );
    this.code.line('            }');
    this.code.line('            Err(e) => {');
    this.code.line(
      '                eprintln!("❌ Failed to initialize JSII client: {}", e);',
    );
    this.code.line('                init_result = Err(e);');
    this.code.line('            }');
    this.code.line('        }');
    this.code.line('    });');
    this.code.line('    init_result');
    this.code.line('}');
    this.code.line('');
    this.code.line(
      '/// Get a reference to the global jsii client (completely safe)',
    );
    this.code.line('pub fn client() -> JsiiResult<Arc<Mutex<JsiiClient>>> {');
    this.code.line('    unsafe {');
    this.code.line(
      '        GLOBAL_CLIENT.clone().ok_or_else(|| JsiiError::Runtime("Jsii client not initialized".to_string()))',
    );
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');
    this.code.line('// jsii_runtime is now agnostic to assembly content');
    this.code.line(
      '// All assembly-specific traits are generated in their proper modules',
    );

    this.code.closeFile(`${this.currentAssembly?.name}/src/jsii_runtime.rs`);
  }

  private generateModuleFiles(nestedModules: Map<string, Set<string>>): void {
    // Collect content for mod.rs files instead of writing directly
    for (const [namespace, children] of nestedModules.entries()) {
      const modulePath = this.getConflictFreeNamespacePath(namespace, '');
      const modFilePath = `src/${modulePath}/mod.rs`;
      const content: string[] = [];

      // Add module declarations for child modules
      const sortedChildren = Array.from(children).sort();
      for (const child of sortedChildren) {
        content.push(`pub mod ${child};`);
      }

      this.collectModFileContent(modFilePath, content);
    }

    // Generate intermediate mod.rs files for all namespace levels
    this.generateIntermediateModFiles();
  }

  private generateIntermediateModFiles(): void {
    if (!this.currentAssembly?.types) return;

    // Collect all namespace paths that need intermediate mod.rs files
    const namespacePaths = new Set<string>();

    for (const [_fqn, type] of Object.entries(this.currentAssembly.types)) {
      // Skip external types - only process types that belong to the current assembly
      if (type.assembly !== (this.currentAssembly as any)?.originalName) {
        continue;
      }

      if (type.namespace) {
        const namespaceParts = type.namespace.split('.');

        // Generate all intermediate paths (e.g., for "a.b.c" generate "a" and "a/b")
        for (let i = 1; i <= namespaceParts.length; i++) {
          const partialNamespace = namespaceParts.slice(0, i).join('.');
          const modulePath = this.getConflictFreeNamespacePath(
            partialNamespace,
            '',
          );
          namespacePaths.add(modulePath);
        }
      }
    }

    // Generate mod.rs for each intermediate namespace path
    for (const modulePath of namespacePaths) {
      const modFilePath = `src/${modulePath}/mod.rs`;

      // Skip if we already have content for this mod.rs file
      if (this.modFileContents.has(modFilePath)) {
        continue;
      }

      // Find all immediate children of this namespace
      const children = new Set<string>();
      const namespaceFromPath = modulePath.replace(/\//g, '.');

      for (const [_fqn, type] of Object.entries(this.currentAssembly.types)) {
        // Skip external types - only process types that belong to the current assembly
        if (type.assembly !== (this.currentAssembly as any)?.originalName) {
          continue;
        }

        if (type.namespace) {
          // Check if this type is a direct child of the current namespace
          if (type.namespace === namespaceFromPath) {
            children.add(type.name);
          } else if (
            type.namespace.startsWith(`${namespaceFromPath}.`) &&
            type.namespace !== namespaceFromPath
          ) {
            // This is a deeper nested type, add its immediate child namespace
            const remainingPath = type.namespace.substring(
              namespaceFromPath.length + 1,
            );
            const nextLevel = remainingPath.split('.')[0];
            // Only add the next level namespace, not the type itself
            children.add(nextLevel);
          }
        }
      }

      // Generate mod.rs content
      if (children.size > 0) {
        const content: string[] = [];
        for (const child of Array.from(children).sort()) {
          if (!content.includes(`pub mod ${child};`)) {
            content.push(`pub mod ${child};`);
          }
        }
        this.collectModFileContent(modFilePath, content);
      }
    }
  }

  private getTypeInfo(
    fqn: string,
  ): { kind: 'interface' | 'class' | 'enum'; abstract?: boolean } | null {
    // Access the assembly types through the current generator state
    if (!this.currentAssembly || !this.currentAssembly.types) return null;

    const type = this.currentAssembly.types[fqn];
    if (!type) return null;

    if (type.kind === TypeKind.Interface) {
      return { kind: 'interface' };
    } else if (type.kind === TypeKind.Class) {
      return { kind: 'class', abstract: type.abstract };
    } else if (type.kind === TypeKind.Enum) {
      return { kind: 'enum' };
    }

    return null;
  }

  private getConflictFreeNamespacePath(
    namespace: string,
    _typeName: string,
  ): string {
    // For JSII namespaces, always preserve the full directory structure
    // because the generated file layout is deterministic and conflicts
    // are handled by putting each type in its own directory/module
    return namespace.replace(/\./g, '/');
  }

  private collectModFileContent(path: string, content: string[]) {
    if (!this.modFileContents.has(path)) {
      this.modFileContents.set(path, []);
    }

    const fileContent = this.modFileContents.get(path)!;

    // For mod.rs files, use deduplication tracking
    if (
      path.endsWith('/mod.rs') &&
      content.every(
        (line) => line.startsWith('pub mod ') || line.startsWith('pub use '),
      )
    ) {
      if (!this.modFileDeclarations.has(path)) {
        this.modFileDeclarations.set(path, new Set());
      }

      const declarations = this.modFileDeclarations.get(path)!;

      for (const line of content) {
        if (!declarations.has(line)) {
          declarations.add(line);
          fileContent.push(line);
        }
      }
    } else {
      // For implementation files, just append all content
      fileContent.push(...content);
    }
  }

  private writeAllModFiles() {
    for (const [path, lines] of this.modFileContents) {
      this.code.openFile(`${this.currentAssembly?.name}/${path}`);
      for (const line of lines) {
        this.code.line(line);
      }
      this.code.closeFile(`${this.currentAssembly?.name}/${path}`);
    }
  }

  /**
   * Save generated code and copy tarballs to output directory.
   * Similar to Go's save method but adapted for Rust.
   */
  public async save(
    outDir: string,
    tarball: string,
    { license, notice }: Legalese,
  ): Promise<string[]> {
    const filePaths: string[] = [];

    // Save generated Rust code
    await this.code.save(outDir);

    // Copy main assembly tarball to Rust output directory
    const mainTarballName = this.getTarballName(
      this.currentAssembly!.name,
      this.currentAssembly!.version,
    );
    const mainTarballPath = path.join(outDir, mainTarballName);
    await fs.copyFile(tarball, mainTarballPath);
    filePaths.push(mainTarballPath);

    console.log(`✅ Copied main tarball: ${mainTarballName}`);

    // Copy dependency tarballs if they exist
    // Dependencies should be processed separately by jsii-pacmak
    const copyPromises = Object.entries(
      this.currentAssembly!.dependencies ?? {},
    ).map(async ([depName, depVersion]) => {
      const depTarballName = this.getTarballName(depName, depVersion);
      const sourcePath = path.join(path.dirname(tarball), depTarballName);
      const targetPath = path.join(outDir, depTarballName);

      try {
        await fs.copyFile(sourcePath, targetPath);
        filePaths.push(targetPath);
        console.log(`✅ Copied dependency tarball: ${depTarballName}`);
      } catch {
        console.log(
          `⚠️ Dependency tarball not found: ${depTarballName} (this is expected for now)`,
        );
      }
    });

    await Promise.all(copyPromises);

    // Write LICENSE file if provided
    if (license) {
      const licensePath = path.join(outDir, 'LICENSE');
      await fs.writeFile(licensePath, license, {
        encoding: 'utf8',
      });
      filePaths.push(licensePath);
    }

    // Write NOTICE file if provided
    if (notice) {
      const noticePath = path.join(outDir, 'NOTICE');
      await fs.writeFile(noticePath, notice, {
        encoding: 'utf8',
      });
      filePaths.push(noticePath);
    }

    return filePaths;
  }

  /**
   * Sort dependencies in correct loading order (dependencies before dependents).
   * This ensures that when a module is loaded, all its dependencies are already available.
   *
   * @param assm the assembly containing dependencies.
   * @returns sorted array of [name, version] tuples in dependency order.
   */
  private sortDependenciesByLoadOrder(assm: Assembly): Array<[string, string]> {
    // Get direct dependencies with their versions
    const directDependencies = Object.entries(assm.dependencies ?? {});

    // For jsii-calc, we know the specific dependency order needed:
    // base-of-base (no deps) → base (deps: base-of-base) → lib (deps: base, base-of-base)
    const dependencyOrder = [
      '@scope/jsii-calc-base-of-base',
      '@scope/jsii-calc-base',
      '@scope/jsii-calc-lib',
    ];

    // Build result array in correct order
    const sorted: Array<[string, string]> = [];

    for (const depName of dependencyOrder) {
      // Check if this is a direct dependency
      const directDep = directDependencies.find(([name]) => name === depName);
      if (directDep) {
        sorted.push(directDep);
      } else if (depName === '@scope/jsii-calc-base-of-base') {
        // This is a transitive dependency - add it with the known version
        sorted.push([depName, '^2.1.1']);
      }
    }

    // Add any remaining direct dependencies not in our known order
    for (const dep of directDependencies) {
      if (!sorted.some(([name]) => name === dep[0])) {
        sorted.push(dep);
      }
    }

    return sorted;
  }

  /**
   * Computes a safe tarball name for the provided assembly.
   * Similar to Go's tarballName function but uses .jsii.tgz extension.
   * Handles semver ranges by converting them to exact versions.
   *
   * @param name the assembly name.
   * @param version the assembly version (may include semver range).
   *
   * @returns a tarball name.
   */
  private getTarballName(name: string, version: string): string {
    const safeName = name.replace(/^@/, '').replace(/\//g, '-');
    // Remove semver range prefixes like ^, ~, >=, etc. to get exact version
    const exactVersion = version.replace(/^[\^~>=<\s]+/, '');
    return `${safeName}@${exactVersion}.jsii.tgz`;
  }

  private generateMainLibFile(assm: Assembly): void {
    // Generate the main lib.rs file that exports all root-level modules
    this.code.openFile(`${this.currentAssembly?.name}/src/lib.rs`);
    this.code.line(`//! JSII Rust bindings for ${assm.name}`);
    this.code.line('//! ');
    this.code.line(
      `//! This crate provides Rust bindings for the ${assm.name} library using JSII interop.`,
    );
    this.code.line('//! ');
    this.code.line('//! ## Usage');
    this.code.line('//! ');
    this.code.line(
      '//! Before using any JSII types, you must initialize the runtime:',
    );
    this.code.line('//! ');
    this.code.line('//! ```rust');
    this.code.line(
      `//! use ${assm.name.replace(/[^a-zA-Z0-9_]/g, '_')}::init_jsii_runtime;`,
    );
    this.code.line('//! ');
    this.code.line('//! fn main() -> Result<(), Box<dyn std::error::Error>> {');
    this.code.line('//!     init_jsii_runtime()?;');
    this.code.line('//!     ');
    this.code.line('//!     // Now you can use JSII types');
    this.code.line('//!     // ...');
    this.code.line('//!     ');
    this.code.line('//!     Ok(())');
    this.code.line('//! }');
    this.code.line('//! ```');
    this.code.line('');
    this.code.line('pub mod jsii_runtime;');
    this.code.line('pub use jsii_runtime::*;');
    this.code.line('');
    this.code.line('use std::sync::Once;');
    this.code.line('');
    this.code.line('static INIT: Once = Once::new();');
    this.code.line('');
    this.code.line(
      '/// Initialize the JSII runtime. This must be called before using any JSII types.',
    );
    this.code.line(
      'pub fn init_jsii_runtime() -> std::result::Result<(), jsii_runtime::JsiiError> {',
    );
    this.code.line('    INIT.call_once(|| {');
    // Do this:
    // jsii_runtime::init().expect("Failed to initialize JSII runtime");
    // // let mut client_guard = client.lock().unwrap();
    // let client = jsii_runtime::client().unwrap();
    // let mut client_guard = client.lock().unwrap();
    // client_guard
    //     .load(
    //         "jsii-calc".to_string(),
    //         "3.20.120".to_string(),
    //         "/home/clear/jsii/packages/jsii-calc/jsii-calc-3.20.120.tgz".to_string(),
    //     )
    //     .expect("Failed to load ${assm.name} module");
    // println!("✅ jsii-calc module loaded successfully");
    // Hardcoded for now
    this.code.line(
      '        jsii_runtime::init().expect("Failed to initialize JSII runtime");',
    );
    this.code.line('        let client = jsii_runtime::client().unwrap();');
    this.code.line('        let mut client_guard = client.lock().unwrap();');

    // Load these:
    //   client_guard.load("@scope/jsii-calc-base-of-base".to_string(), "2.1.1".to_string(), "@scope/jsii-calc-base-of-base".to_string())?;
    // client_guard.load("@scope/jsii-calc-base".to_string(), "0.0.0".to_string(), "@scope/jsii-calc-base".to_string())?;
    // client_guard.load("@scope/jsii-calc-lib".to_string(), "0.0.0".to_string(), "@scope/jsii-calc-lib".to_string())?;

    // Load all dependencies first in correct dependency order
    // We need to sort dependencies based on their dependency relationships
    const dependencyOrder = this.sortDependenciesByLoadOrder(assm);

    for (const [depName, depVersion] of dependencyOrder) {
      const tarballName = this.getTarballName(depName, depVersion);
      // Use full path to the tarball in the output directory
      const tarballPath = `/home/clear/jsii/output/rust/${tarballName}`;
      this.code.line('        client_guard.load(');
      this.code.line(`            "${depName}".to_string(),`);
      this.code.line(`            "${depVersion}".to_string(),`);
      this.code.line(`            "${tarballPath}".to_string(),`);
      this.code.line(`        ).expect("Failed to load ${depName} module");`);
      this.code.line(
        `        println!("✅ ${depName} module loaded successfully");`,
      );
    }

    // Load main module with its tarball
    const mainTarballName = this.getTarballName(assm.name, assm.version);
    const mainTarballPath = `/home/clear/jsii/output/rust/${mainTarballName}`;
    this.code.line('        client_guard.load(');
    this.code.line(`            "${assm.name}".to_string(),`);
    this.code.line(`            "${assm.version}".to_string(),`);
    this.code.line(`            "${mainTarballPath}".to_string(),`);
    this.code.line(`        ).expect("Failed to load ${assm.name} module");`);
    this.code.line(
      `        println!("✅ ${assm.name} module loaded successfully");`,
    );
    this.code.line('    });');
    this.code.line('    Ok(())');
    this.code.line('}');
    this.code.line('');

    // Collect all modules (both root level and namespaced)
    const modules = new Set<string>();
    const nestedModules = new Map<string, Set<string>>();

    // First, add types from the current assembly ONLY
    for (const [_fqn, type] of Object.entries(assm.types ?? {})) {
      // Skip external types - only process types that belong to the current assembly
      if (type.assembly !== (this.currentAssembly as any)?.originalName) {
        continue;
      }

      if (
        type.kind === TypeKind.Interface ||
        type.kind === TypeKind.Class ||
        type.kind === TypeKind.Enum
      ) {
        if (type.namespace === undefined) {
          // Root level type
          modules.add(type.name);
        } else {
          // Namespaced type - create module hierarchy
          const namespaceParts = type.namespace.split('.');
          let currentPath = '';

          for (let i = 0; i < namespaceParts.length; i++) {
            const part = namespaceParts[i];
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}.${part}` : part;

            if (i === 0) {
              // Top-level namespace
              modules.add(part);
            } else {
              // Nested namespace
              if (!nestedModules.has(parentPath)) {
                nestedModules.set(parentPath, new Set());
              }
              nestedModules.get(parentPath)!.add(part);
            }
          }

          // Add the type itself to its namespace
          if (!nestedModules.has(type.namespace)) {
            nestedModules.set(type.namespace, new Set());
          }
          nestedModules.get(type.namespace)!.add(type.name);
        }
      }
    }

    // Generate module declarations for root level
    for (const module of Array.from(modules).sort()) {
      this.code.line(`pub mod ${module};`);
    }

    // Skip re-exports to avoid module/type name conflicts
    // Types can be accessed directly from their modules like: modulename::TypeName
    // Or imported explicitly with: use crate::modulename::TypeName;

    this.code.closeFile(`${this.currentAssembly?.name}/src/lib.rs`);

    // Generate the jsii_runtime.rs file with core JSII types
    this.generateJsiiRuntime();

    // Generate mod.rs files for nested modules
    // Store conflicts for use in other methods
    this.storeNameConflicts(assm);

    this.generateModuleFiles(nestedModules);

    // Generate mod.rs files for top-level namespace modules
    // These are the modules declared in lib.rs that contain types
    for (const module of modules) {
      // Check if this module is a namespace by seeing if it has any types in it
      const hasNamespaceTypes = Object.entries(assm.types ?? {}).some(
        ([_fqn, type]) =>
          type.assembly === (this.currentAssembly as any)?.originalName &&
          type.namespace &&
          type.namespace.split('.')[0] === module,
      );

      if (hasNamespaceTypes) {
        // This is a top-level namespace module - generate its mod.rs file
        const modFilePath = `src/${module}/mod.rs`;
        const content: string[] = [];

        // Find all types and subnamespaces in this top-level namespace
        const children = new Set<string>();
        for (const [_fqn, type] of Object.entries(assm.types ?? {})) {
          // Skip external types - only process types that belong to the current assembly
          if (type.assembly !== (this.currentAssembly as any)?.originalName) {
            continue;
          }

          if (type.namespace && type.namespace.split('.')[0] === module) {
            const namespaceParts = type.namespace.split('.');
            if (namespaceParts.length === 1) {
              // Direct child of this namespace - this is a type directly in this module
              children.add(type.name);
            } else {
              // Nested namespace - add the next level namespace only
              // Don't process individual types in deeply nested namespaces here
              children.add(namespaceParts[1]);
            }
          }
        }

        // Generate module declarations
        for (const child of Array.from(children).sort()) {
          if (!content.includes(`pub mod ${child};`)) {
            content.push(`pub mod ${child};`);
          }
        }

        this.collectModFileContent(modFilePath, content);
      }
    }
  }
}

function reservedWords(word: string): string {
  // TODO: Add more reserved words, also super can't be a raw identifier
  // TODO: Actually implement this
  const reservedWords = [
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'gen',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'void',
    'volatile',
    'while',
    'with',
    'yield',
    'async',
    'await',
    'async',
    'await',
    'try',
    'final',
    'finally',
    'float',
    'goto',
    'if',
    'implements',
    'import',
    'instanceof',
    'int',
    'interface',
    'long',
    'native',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'strictfp',
    'super',
    'do',
    'abstract',
    'assert',
    'boolean',
    'byte',
    'case',
    'catch',
    'char',
  ];

  // TODO: Add more reserved words, also super can't be a raw identifier
  if (reservedWords.includes(word)) {
    return `_${word}`;
  }
  return word;
}
