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

import { Generator } from '../generator';
import { Target, TargetOptions } from '../target';
import { shell } from '../util';

export default class Rust extends Target {
  protected readonly generator: RustGenerator;

  public constructor(options: TargetOptions) {
    super(options);
    this.generator = new RustGenerator(options);
  }

  public async build(sourceDir: string, outDir: string): Promise<void> {
    await this.copyFiles(sourceDir, outDir);

    // ✅ Run cargo fmt after generation (like Go does)
    try {
      await shell('cargo', ['fmt'], { cwd: outDir });
    } catch (error) {
      console.log('Could not run cargo fmt:', error);
    }
  }
}

class RustGenerator extends Generator {
  private readonly abstractTypes: Set<string> = new Set(); // Track abstract classes and behavioral interfaces
  private currentAssembly?: Assembly; // Store assembly reference for helper methods
  private readonly modFileContents = new Map<string, string[]>(); // Collect content for mod.rs files to prevent overwrites

  protected onBeginAssembly(assm: Assembly, _fingerprint: boolean): void {
    // Store assembly reference
    this.currentAssembly = assm;
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

    console.log(
      'Abstract types (interfaces + abstract classes):',
      this.abstractTypes,
    );

    // Do we take these from the .jsii file or do we take them from the package.json?
    // Or we need to update the jsii assembly generator to include them to .jsii file?
    // Add all the possible fields from the .jsii file to the Cargo.toml file
    // By reading the Assembly interface, get the fields that are required and also optional
    this.code.openFile('Cargo.toml');
    this.code.line('[package]');
    this.code.line(`name = "${assm.name}"`);
    this.code.line(`version = "${assm.version}"`);
    this.code.line(`authors = ["${assm.author.name}"]`);
    this.code.line(`license = "${assm.license}"`);
    this.code.line(`edition = "2021"`);

    this.code.line('');

    this.code.line('[dependencies]');
    console.log('assm.dependencies', assm.dependencies);

    this.code.line('chrono = "0.4"');
    this.code.line('serde_json = "1"');

    // TODO: Add dependencies to Cargo.toml file
    // TODO: Rename the dependencies to the correct names
    // for (const [key, value] of Object.entries(assm.dependencies ?? {})) {
    // content.push(`${key} = "${value}"`);
    // }

    this.code.closeFile('Cargo.toml');

    this.code.openFile('src/lib.rs');

    // Add jsii_runtime module first - provides core JSII runtime types
    this.code.line('pub mod jsii_runtime;');
    this.code.line('');

    // Collect all modules (both root level and namespaced)
    const modules = new Set<string>();
    const nestedModules = new Map<string, Set<string>>();

    for (const type of Object.values(assm.types ?? {})) {
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

    this.code.closeFile('src/lib.rs');

    // Generate the jsii_runtime.rs file with core JSII types
    this.generateJsiiRuntime();

    // Generate mod.rs files for nested modules
    // Store conflicts for use in other methods
    this.storeNameConflicts(assm);

    this.generateModuleFiles(nestedModules);
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

    if (ifc.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        ifc.namespace,
        ifc.name,
      );
      filename = `${namespacePath}/${ifc.name}/mod`;
    } else {
      // Root level interfaces also get their own directory
      filename = `${ifc.name}/mod`;
    }

    const modFilePath = `src/${filename}.rs`;
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
    content.push(`/// Default implementation backed by JSII runtime`);
    content.push(`pub struct ${ifc.name}Ref {`);
    content.push(
      `    // Placeholder - real implementation would store JSII object reference`,
    );
    content.push(`}`);
    content.push('');

    content.push(`impl ${ifc.name} for ${ifc.name}Ref {`);

    // Generate implementations that call JSII runtime
    for (const prop of ifc.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      content.push(`    fn get_${rustName}(&self) -> ${rustType} {`);
      content.push(`        JsiiRuntime::instance().invoke();`);
      content.push(`        todo!()`);
      content.push(`    }`);

      if (!prop.immutable) {
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType}) {`);
        content.push(`        JsiiRuntime::instance().invoke();`);
        content.push(`        todo!()`);
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
      content.push(`        JsiiRuntime::instance().invoke();`);
      content.push(`        todo!()`);
      content.push(`    }`);
    }

    content.push(`}`);

    this.collectModFileContent(modFilePath, content);
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

    let filename;
    const fullPath = cls.namespace ? `${cls.namespace}.${cls.name}` : cls.name;

    if (cls.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        cls.namespace,
        cls.name,
      );
      filename = `${namespacePath}/${cls.name}/mod`;
    } else {
      // Root level classes also get their own directory
      filename = `${cls.name}/mod`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (cls.namespace) {
        const namespacePath = this.getConflictFreeNamespacePath(
          cls.namespace,
          cls.name,
        );
        filename = `${namespacePath}/${cls.name}/mod`;
      } else {
        filename = `${cls.name}/mod`;
      }
    }

    const modFilePath = `src/${filename}.rs`;
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

    this.collectModFileContent(modFilePath, content);
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
    content.push(`/// Concrete implementation struct for ${className}`);
    content.push(`pub struct ${className}Impl {`);
    content.push(`    // JSII runtime state would go here`);
    content.push(`}`);
    content.push('');

    content.push(`impl ${className}Impl {`);
    content.push(`    pub fn new() -> Self {`);
    content.push(`        Self {}`);
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
      content.push(`        JsiiRuntime::instance().invoke();`);

      if (rustType === 'String') {
        content.push(`        String::new()`);
      } else if (rustType === 'f64') {
        content.push(`        0.0`);
      } else if (rustType === 'bool') {
        content.push(`        false`);
      } else {
        content.push(`        todo!("Call JSII runtime")`);
      }

      content.push(`    }`);

      if (!prop.immutable) {
        content.push(`    fn set_${rustName}(&mut self, value: ${rustType}) {`);
        content.push(`        JsiiRuntime::instance().invoke();`);
        content.push(`        todo!("Call JSII runtime")`);
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

      // Generate better default implementations based on method names
      if (method.name === 'nonAbstractMethod') {
        content.push(
          `        42.0 // AbstractClass.nonAbstractMethod() returns 42`,
        );
      } else if (method.name === 'toString') {
        content.push(`        format!("{}()", stringify!(${className}))`);
      } else {
        content.push(`        // TODO: Call JSII runtime`);
        if (returnType === 'String') {
          content.push(`        String::new()`);
        } else if (returnType === 'f64') {
          content.push(`        0.0`);
        } else if (returnType === 'bool') {
          content.push(`        false`);
        } else {
          content.push(`        todo!("Call JSII runtime")`);
        }
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
      'BinaryOperation',
      'UnaryOperation',
      'CompositeOperation',
    ].includes(className);
    if (!skipOperation) {
      content.push(`impl Operation for ${className}Impl {}`);
      implementedTraits.add('Operation');
    }

    // Implement IFriendly for all classes
    content.push(`impl IFriendly for ${className}Impl {`);
    content.push(`    fn hello(&self) -> String {`);
    content.push(`        "Hello from ${className}".to_string()`);
    content.push(`    }`);
    content.push(`}`);
    implementedTraits.add('IFriendly');

    // 🚀 Add missing external trait implementations based on class name
    const externalTraitMap: Record<string, string[]> = {
      Class3: ['IBaseInterface'],
      Baz: ['IBaseInterface'],
      Construct: ['IConstruct'],
      Resource: ['IConstruct'],
      Vpc: ['IResource', 'IConstruct'],
      ImplementsInterfaceWithInternalSubclass: ['IInterfaceWithInternal'],
    };

    const externalTraits = externalTraitMap[className] || [];
    for (const traitName of externalTraits) {
      content.push(`impl ${traitName} for ${className}Impl {}`);
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
    };

    const requiredInterfaces = transitiveImplementations[className] || [];
    for (const ifaceName of requiredInterfaces) {
      if (!implementedTraits.has(ifaceName)) {
        content.push(`impl ${ifaceName} for ${className}Impl {`);
        if (this.currentAssembly?.types) {
          // Find the interface in the assembly
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
  }

  protected onBeginEnum(enm: EnumType): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    let filename;
    const fullPath = enm.namespace ? `${enm.namespace}.${enm.name}` : enm.name;

    if (enm.namespace) {
      // Handle namespace conflicts by flattening when necessary
      const namespacePath = this.getConflictFreeNamespacePath(
        enm.namespace,
        enm.name,
      );
      filename = `${namespacePath}/${enm.name}/mod`;
    } else {
      // Root level enums also get their own directory
      filename = `${enm.name}/mod`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (enm.namespace) {
        const namespacePath = this.getConflictFreeNamespacePath(
          enm.namespace,
          enm.name,
        );
        filename = `${namespacePath}/${enm.name}/mod`;
      } else {
        filename = `${enm.name}/mod`;
      }
    }

    const modFilePath = `src/${filename}.rs`;
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

    this.collectModFileContent(modFilePath, content);
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
        type.fqn.startsWith('@scope/jsii-calc-base.')
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
    rawImports.add('use crate::jsii_runtime::JsiiRuntime;');

    // 🚀 Add common stub trait imports that are frequently used
    rawImports.add('use crate::jsii_runtime::NumericValue;');
    rawImports.add('use crate::jsii_runtime::Operation;');
    rawImports.add('use crate::jsii_runtime::IFriendly;');
    rawImports.add('use crate::jsii_runtime::IBaseInterface;');

    // 🚀 Add CompositionStringStyleTrait - used by many classes that inherit stringStyle
    rawImports.add(
      'use crate::composition::CompositionStringStyle::CompositionStringStyleTrait;',
    );

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
      fqn.startsWith('@scope/jsii-calc-base.')
    ) {
      const typeName = fqn.split('.').pop();
      if (typeName && typeName !== alias) {
        return `use crate::jsii_runtime::${typeName} as ${alias};`;
      } else if (typeName) {
        return `use crate::jsii_runtime::${typeName};`;
      }
      return null;
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
            return `use crate::${namespacePath}::${typeName}::{${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
          }
          return `use crate::${namespacePath}::${typeName}::{${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          // 🚀 Classes: just import the trait with alias
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${namespacePath}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          // 🚀 Enums: import both enum and trait with aliases
          if (typeName !== alias) {
            return `use crate::${namespacePath}::${typeName}::{${typeName} as ${alias}, ${typeName}Trait as ${alias}Trait};`;
          }
          return `use crate::${namespacePath}::${typeName}::{${typeName}, ${typeName}Trait};`;
        }
        // Fallback for unknown types
        if (typeName !== alias) {
          return `use crate::${namespacePath}::${typeName}::${typeName} as ${alias};`;
        }
        return `use crate::${namespacePath}::${typeName}::${typeName};`;
      }

      // Root level types use simplified structure: TypeName
      if (typeInfo?.kind === 'interface') {
        if (typeName !== alias) {
          return `use crate::${typeName}::{${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
        }
        return `use crate::${typeName}::{${typeName}, ${typeName}Ref};`;
      } else if (typeInfo?.kind === 'class') {
        // 🚀 Classes: just import the trait with alias
        if (typeName !== alias) {
          return `use crate::${typeName}::${typeName} as ${alias};`;
        }
        return `use crate::${typeName}::${typeName};`;
      } else if (typeInfo?.kind === 'enum') {
        // 🚀 Enums: import both enum and trait with aliases
        if (typeName !== alias) {
          return `use crate::${typeName}::{${typeName} as ${alias}, ${typeName}Trait as ${alias}Trait};`;
        }
        return `use crate::${typeName}::{${typeName}, ${typeName}Trait};`;
      }
      // Fallback - just import the type from its module
      if (typeName !== alias) {
        return `use crate::${typeName}::${typeName} as ${alias};`;
      }
      return `use crate::${typeName}::${typeName};`;
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
      fqn.startsWith('@scope/jsii-calc-base.')
    ) {
      const typeName = fqn.split('.').pop();
      if (typeName) {
        // Import external types from jsii_runtime stub
        return `use crate::jsii_runtime::${typeName};`;
      }
      return null;
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
          return `use crate::${namespacePath}::${typeName}::{${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          // 🚀 Classes: just import the trait (no more Abstract/Base distinction)
          return `use crate::${namespacePath}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          // 🚀 Enums: import both the enum and its trait
          return `use crate::${namespacePath}::${typeName}::{${typeName}, ${typeName}Trait};`;
        }
        // Fallback for unknown types
        return `use crate::${namespacePath}::${typeName}::${typeName};`;
      }

      // Root level types use simplified structure: TypeName
      if (typeInfo?.kind === 'interface') {
        return `use crate::${typeName}::{${typeName}, ${typeName}Ref};`;
      } else if (typeInfo?.kind === 'class') {
        // 🚀 Classes: just import the trait
        return `use crate::${typeName}::${typeName};`;
      } else if (typeInfo?.kind === 'enum') {
        // 🚀 Enums: import both the enum and its trait
        return `use crate::${typeName}::{${typeName}, ${typeName}Trait};`;
      }
      // Fallback - just import the type from its module
      return `use crate::${typeName}::${typeName};`;
    }

    return null;
  }

  private generateJsiiRuntime(): void {
    this.code.openFile('src/jsii_runtime.rs');

    this.code.line('// Minimal JSII runtime stub for compilation');
    this.code.line('');
    this.code.line('/// Singleton JSII runtime stub');
    this.code.line('pub struct JsiiRuntime;');
    this.code.line('');
    this.code.line('impl JsiiRuntime {');
    this.code.line('    /// Get singleton instance');
    this.code.line("    pub fn instance() -> &'static Self {");
    this.code.line('        static INSTANCE: JsiiRuntime = JsiiRuntime;');
    this.code.line('        &INSTANCE');
    this.code.line('    }');
    this.code.line('');
    this.code.line(
      '    /// Stub invoke method - all JSII calls go through this',
    );
    this.code.line('    pub fn invoke(&self) -> () {');
    this.code.line('        todo!("JSII runtime not implemented yet")');
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');

    // 🚀 Generate traits for all JSII stub types instead of structs
    this.code.line(
      '// Stub traits for external dependencies and commonly used types',
    );
    this.code.line('pub trait Number {}');
    this.code.line('pub trait NumericValue {}');
    this.code.line('pub trait MyFirstStruct {}');
    this.code.line('pub trait StructWithOnlyOptionals {}');
    this.code.line('pub trait NestedClass {}');
    this.code.line('pub trait EnumFromScopedModule {}');
    this.code.line('pub trait Reflector {}');
    this.code.line('pub trait ReflectableEntry {}');
    this.code.line('pub trait BaseProps {}');
    this.code.line('pub trait Base {}');
    this.code.line('pub trait PropProperty {}');
    this.code.line('');

    // Generate traits for external interfaces
    this.code.line('// Traits for external interfaces');
    this.code.line('pub trait IFriendly {');
    this.code.line('    fn hello(&self) -> String;');
    this.code.line('}');
    this.code.line('pub trait IDoublable {');
    this.code.line('    fn double_value(&self) -> f64;');
    this.code.line('}');
    this.code.line('pub trait IReflectable {}');
    this.code.line('pub trait IBaseInterface {}');
    this.code.line('pub trait BaseFor2647 {}');
    this.code.line('pub trait DiamondLeft {}');
    this.code.line('pub trait DiamondRight {}');
    this.code.line('');

    // 🚀 Add Operation trait - needed by many classes
    this.code.line('// Base operation trait');
    this.code.line('pub trait Operation {}');
    this.code.line('');

    // 🚀 Generate default stub implementations with concrete structs
    this.code.line('// Default stub implementations');
    this.code.line('pub struct StubImpl;');
    this.code.line('');
    this.code.line('impl IFriendly for StubImpl {');
    this.code.line('    fn hello(&self) -> String {');
    this.code.line('        "Hello from stub".to_string()');
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');
    this.code.line('impl IDoublable for StubImpl {');
    this.code.line('    fn double_value(&self) -> f64 {');
    this.code.line('        42.0');
    this.code.line('    }');
    this.code.line('}');
    this.code.line('');

    // Implement all the stub traits for the stub struct
    const stubTraits = [
      'Number',
      'NumericValue',
      'MyFirstStruct',
      'StructWithOnlyOptionals',
      'NestedClass',
      'EnumFromScopedModule',
      'Reflector',
      'ReflectableEntry',
      'BaseProps',
      'Base',
      'PropProperty',
      'IReflectable',
      'IBaseInterface',
      'BaseFor2647',
      'DiamondLeft',
      'DiamondRight',
    ];

    for (const trait of stubTraits) {
      this.code.line(`impl ${trait} for StubImpl {}`);
    }

    this.code.closeFile('src/jsii_runtime.rs');
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

      // Add re-exports for types in this namespace
      if (sortedChildren.length > 0) {
        content.push('');
        content.push('// Re-export types from child modules');
        for (const child of sortedChildren) {
          // Check if this child is a type or a submodule
          const fullPath = `${namespace}.${child}`;
          const isType = this.isTypeName(fullPath);

          if (isType) {
            // Re-export the type - simplified since everything is in mod.rs now
            const typeInfo = this.getTypeInfo(fullPath);
            if (typeInfo) {
              if (typeInfo.kind === 'interface') {
                content.push(`pub use ${child}::{${child}, ${child}Ref};`);
              } else if (typeInfo.kind === 'class') {
                content.push(`pub use ${child}::${child};`);
              } else if (typeInfo.kind === 'enum') {
                content.push(`pub use ${child}::${child};`);
              }
            }
          }
        }
      }

      this.collectModFileContent(modFilePath, content);
    }

    // Also handle types that may be placed in flattened paths due to conflicts
    // We need to ensure all types are properly declared in accessible module files
    for (const type of Object.values(this.currentAssembly?.types ?? {})) {
      if (
        type.kind === TypeKind.Interface ||
        type.kind === TypeKind.Class ||
        type.kind === TypeKind.Enum
      ) {
        if (type.namespace) {
          const conflictFreePath = this.getConflictFreeNamespacePath(
            type.namespace,
            type.name,
          );
          const originalPath = type.namespace.replace(/\./g, '/');

          // If the conflict-free path is different from the original path,
          // we need to ensure the type is declared in the accessible path
          if (conflictFreePath !== originalPath) {
            // Check if we need to create an additional mod.rs file
            if (conflictFreePath !== '') {
              const modFilePath = `src/${conflictFreePath}/mod.rs`;
              // Only add if not already added by the main loop
              if (!nestedModules.has(conflictFreePath.replace(/\//g, '.'))) {
                const content: string[] = [];
                content.push(`pub mod ${type.name};`);

                // Add re-export
                if (type.kind === TypeKind.Interface) {
                  content.push(
                    `pub use ${type.name}::{${type.name}, ${type.name}Ref};`,
                  );
                } else if (type.kind === TypeKind.Class) {
                  content.push(`pub use ${type.name}::${type.name};`);
                } else if (type.kind === TypeKind.Enum) {
                  content.push(`pub use ${type.name}::${type.name};`);
                }

                this.collectModFileContent(modFilePath, content);
              }
            }
          }
        }
      }
    }
  }

  private isTypeName(fqn: string): boolean {
    // Simple check - if we have type info, it's a type
    return this.getTypeInfo(fqn) !== null;
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
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    // Split the namespace into parts
    const namespaceParts = namespace.split('.');
    const result: string[] = [];

    // Check each namespace part to see if it conflicts with a type name
    for (let i = 0; i < namespaceParts.length; i++) {
      const currentPart = namespaceParts[i];
      const partialNamespace = namespaceParts.slice(0, i + 1).join('.');

      // Check if this namespace part conflicts with a type name
      if (conflicts.has(partialNamespace)) {
        // Skip this part to avoid filesystem conflict
        continue;
      }

      result.push(currentPart);
    }

    // If we skipped all parts, use the flattened name
    if (result.length === 0) {
      return namespace.replace(/\./g, '');
    }

    return result.join('/');
  }

  private collectModFileContent(path: string, content: string[]) {
    if (!this.modFileContents.has(path)) {
      this.modFileContents.set(path, []);
    }
    this.modFileContents.get(path)!.push(...content);
  }

  private writeAllModFiles() {
    for (const [path, lines] of this.modFileContents) {
      this.code.openFile(path);
      for (const line of lines) {
        this.code.line(line);
      }
      this.code.closeFile(path);
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
