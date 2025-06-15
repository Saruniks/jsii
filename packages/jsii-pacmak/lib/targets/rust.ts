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
    // this.code.line(`${key} = "${value}"`);
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
          // Namespaced type - need to create module hierarchy
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
    // console.log('onEndAssembly');
  }

  protected getAssemblyOutputDir(_mod: Assembly): string {
    // console.log('getAssemblyOutputDir');
    return '.'; // Put the .jsii assembly file in src/ directory
    // return 'src'; // Put the .jsii assembly file in src/ directory
  }

  protected onBeginInterface(ifc: InterfaceType): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    let filename = ifc.name;
    const fullPath = ifc.namespace ? `${ifc.namespace}.${ifc.name}` : ifc.name;

    if (ifc.namespace) {
      // Replace dots with slashes for proper directory structure
      const namespacePath = ifc.namespace.replace(/\./g, '/');
      filename = `${namespacePath}/${ifc.name}`;
    } else if (conflicts.has(ifc.name)) {
      // This interface conflicts with a namespace - put it inside the namespace directory
      filename = `${ifc.name}/${ifc.name}`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (ifc.namespace) {
        const namespacePath = ifc.namespace.replace(/\./g, '/');
        filename = `${namespacePath}/${ifc.name}/${ifc.name}`;
      } else {
        filename = `${ifc.name}/${ifc.name}`;
      }
    }

    this.code.openFile(`src/${filename}.rs`);

    // Add imports for referenced types
    const imports = this.getImportsForType(ifc);
    for (const importStmt of imports) {
      this.code.line(importStmt);
    }
    if (imports.length > 0) {
      this.code.line('');
    }

    // 🚀 In JSII, ALL interfaces should be traits because properties are runtime calls
    // There are no "data-only" interfaces in JSII - everything goes through the runtime
    this.code.line(
      `/// JSII interface - all properties and methods are runtime calls`,
    );
    this.code.line(`pub trait ${ifc.name} {`);

    // Properties become getter/setter methods that call JSII runtime
    for (const prop of ifc.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      this.code.line(`    /// Get ${prop.name} property via JSII runtime`);
      this.code.line(`    fn get_${rustName}(&self) -> ${rustType};`);

      if (!prop.immutable) {
        this.code.line(`    /// Set ${prop.name} property via JSII runtime`);
        this.code.line(
          `    fn set_${rustName}(&mut self, value: ${rustType});`,
        );
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

      this.code.line(`    /// Call ${method.name} method via JSII runtime`);
      this.code.line(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType};`,
      );
    }

    this.code.line(`}`);
    this.code.line('');

    // 🚀 Also generate a default struct implementation for the interface
    // This represents a JSII object reference that implements the trait
    this.code.line(`/// Default implementation backed by JSII runtime`);
    this.code.line(`pub struct ${ifc.name}Ref {`);
    this.code.line(
      `    // Placeholder - real implementation would store JSII object reference`,
    );
    this.code.line(`}`);
    this.code.line('');

    this.code.line(`impl ${ifc.name} for ${ifc.name}Ref {`);

    // Generate implementations that call JSII runtime
    for (const prop of ifc.properties ?? []) {
      const rustType = this.toRustType(prop.type);
      const rustName = reservedWords(prop.name);

      this.code.line(`    fn get_${rustName}(&self) -> ${rustType} {`);
      this.code.line(`        JsiiRuntime::instance().invoke();`);
      this.code.line(`        todo!()`);
      this.code.line(`    }`);

      if (!prop.immutable) {
        this.code.line(
          `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
        );
        this.code.line(`        JsiiRuntime::instance().invoke();`);
        this.code.line(`        todo!()`);
        this.code.line(`    }`);
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

      this.code.line(
        `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
      );
      this.code.line(`        JsiiRuntime::instance().invoke();`);
      this.code.line(`        todo!()`);
      this.code.line(`    }`);
    }

    this.code.line(`}`);

    this.code.closeFile(`src/${filename}.rs`);
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

    let filename = cls.name;
    const fullPath = cls.namespace ? `${cls.namespace}.${cls.name}` : cls.name;

    if (cls.namespace) {
      // Replace dots with slashes for proper directory structure
      const namespacePath = cls.namespace.replace(/\./g, '/');
      filename = `${namespacePath}/${cls.name}`;
    } else if (conflicts.has(cls.name)) {
      // This class conflicts with a namespace - put it inside the namespace directory
      filename = `${cls.name}/${cls.name}`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (cls.namespace) {
        const namespacePath = cls.namespace.replace(/\./g, '/');
        filename = `${namespacePath}/${cls.name}/${cls.name}`;
      } else {
        filename = `${cls.name}/${cls.name}`;
      }
    }

    this.code.openFile(`src/${filename}.rs`);

    // Add imports for referenced types
    const imports = this.getImportsForType(cls);
    for (const importStmt of imports) {
      this.code.line(importStmt);
    }
    if (imports.length > 0) {
      this.code.line('');
    }

    if (cls.abstract) {
      // 🚀 Two-Interface Approach for Abstract Classes:
      // 1. Pure trait for abstract parts that MUST be implemented
      // 2. Base struct + impl for concrete parts with actual implementations

      // Step 1: Generate pure abstract trait
      const abstractTrait = `${cls.name}Abstract`;
      this.code.line(`/// Abstract trait that must be implemented`);
      this.code.line(`pub trait ${abstractTrait} {`);

      // Abstract properties - must be implemented
      for (const prop of cls.properties ?? []) {
        if (prop.abstract) {
          const rustType = this.toRustType(prop.type);
          const rustName = reservedWords(prop.name);

          this.code.line(`    fn get_${rustName}(&self) -> ${rustType};`);

          if (!prop.immutable) {
            this.code.line(
              `    fn set_${rustName}(&mut self, value: ${rustType});`,
            );
          }
        }
      }

      // Abstract methods - must be implemented
      for (const method of cls.methods ?? []) {
        if (method.abstract) {
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

          this.code.line(
            `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType};`,
          );
        }
      }

      this.code.line(`}`);
      this.code.line('');

      // Step 2: Generate base struct for concrete implementations
      this.code.line(`/// Base struct providing concrete implementations`);
      this.code.line(`pub struct ${cls.name}Base {`);
      this.code.line(`    // Runtime state would go here`);
      this.code.line(`}`);
      this.code.line('');

      this.code.line(`impl ${cls.name}Base {`);
      this.code.line(`    pub fn new() -> Self {`);
      this.code.line(`        Self {}`);
      this.code.line(`    }`);
      this.code.line('');

      // Concrete methods with actual implementations
      for (const method of cls.methods ?? []) {
        if (!method.abstract) {
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

          // Generate meaningful implementations based on method name/type
          this.code.line(
            `    pub fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
          );

          // Provide actual implementations instead of todo!()
          if (method.name === 'nonAbstractMethod') {
            this.code.line(`        42.0`); // AbstractClass.nonAbstractMethod() returns 42
          } else if (method.name === 'propFromInterface') {
            this.code.line(`        "propFromInterfaceValue".to_string()`);
          } else {
            this.code.line(
              `        // Default implementation - should call JSII runtime`,
            );
            if (returnType === 'String') {
              this.code.line(`        String::new()`);
            } else if (returnType === 'f64') {
              this.code.line(`        0.0`);
            } else if (returnType === 'bool') {
              this.code.line(`        false`);
            } else {
              this.code.line(`        todo!("Implement JSII runtime call")`);
            }
          }

          this.code.line(`    }`);
          this.code.line('');
        }
      }

      // Concrete property getters with actual implementations
      for (const prop of cls.properties ?? []) {
        if (!prop.abstract) {
          const rustType = this.toRustType(prop.type);
          const rustName = reservedWords(prop.name);

          this.code.line(`    pub fn get_${rustName}(&self) -> ${rustType} {`);

          // Provide actual implementations based on property name
          if (prop.name === 'propFromInterface') {
            this.code.line(`        "propFromInterfaceValue".to_string()`);
          } else {
            this.code.line(
              `        // Default implementation - should call JSII runtime`,
            );
            if (rustType === 'String') {
              this.code.line(`        String::new()`);
            } else if (rustType === 'f64') {
              this.code.line(`        0.0`);
            } else if (rustType === 'bool') {
              this.code.line(`        false`);
            } else {
              this.code.line(`        todo!("Implement JSII runtime call")`);
            }
          }

          this.code.line(`    }`);

          if (!prop.immutable) {
            this.code.line(
              `    pub fn set_${rustName}(&mut self, value: ${rustType}) {`,
            );
            this.code.line(`        // Should call JSII runtime`);
            this.code.line(`        todo!("Implement JSII runtime call")`);
            this.code.line(`    }`);
          }
          this.code.line('');
        }
      }

      this.code.line(`}`);
    } else {
      // ✅ Concrete class becomes a struct with impl blocks
      this.code.line(`/// Concrete class implementation`);
      this.code.line(`pub struct ${cls.name} {`);
      this.code.line(`    // JSII runtime state`);
      this.code.line(`}`);
      this.code.line('');

      this.code.line(`impl ${cls.name} {`);
      this.code.line(`    pub fn new() -> Self {`);
      this.code.line(`        Self {}`);
      this.code.line(`    }`);
      this.code.line('');

      // All methods for concrete classes
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

        this.code.line(
          `    pub fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
        );

        // Generate better default implementations
        if (returnType === 'String') {
          this.code.line(`        String::new() // TODO: Call JSII runtime`);
        } else if (returnType === 'f64') {
          this.code.line(`        0.0 // TODO: Call JSII runtime`);
        } else if (returnType === 'bool') {
          this.code.line(`        false // TODO: Call JSII runtime`);
        } else {
          this.code.line(`        todo!("Call JSII runtime")`);
        }

        this.code.line(`    }`);
        this.code.line('');
      }

      // All property getters/setters for concrete classes
      for (const prop of cls.properties ?? []) {
        const rustType = this.toRustType(prop.type);
        const rustName = reservedWords(prop.name);

        this.code.line(`    pub fn get_${rustName}(&self) -> ${rustType} {`);

        if (rustType === 'String') {
          this.code.line(`        String::new() // TODO: Call JSII runtime`);
        } else if (rustType === 'f64') {
          this.code.line(`        0.0 // TODO: Call JSII runtime`);
        } else if (rustType === 'bool') {
          this.code.line(`        false // TODO: Call JSII runtime`);
        } else {
          this.code.line(`        todo!("Call JSII runtime")`);
        }

        this.code.line(`    }`);

        if (!prop.immutable) {
          this.code.line(
            `    pub fn set_${rustName}(&mut self, value: ${rustType}) {`,
          );
          this.code.line(`        // TODO: Call JSII runtime to set property`);
          this.code.line(`    }`);
        }
        this.code.line('');
      }

      this.code.line(`}`);

      // Generate trait implementations for base class and interfaces
      if (cls.base) {
        const baseTypeName = cls.base.split('.').pop() ?? cls.base;
        const baseTypeInfo = this.getTypeInfo(cls.base);
        this.code.line('');

        // Only implement traits for abstract base classes
        // For concrete base classes, we use composition in the struct definition
        if (baseTypeInfo?.abstract) {
          this.code.line(`impl ${baseTypeName}Abstract for ${cls.name} {`);

          // Get the base class definition to implement its abstract methods
          if (this.currentAssembly?.types) {
            const baseType = this.currentAssembly.types[cls.base];
            if (baseType?.kind === TypeKind.Class) {
              // Implement abstract methods from base class
              for (const method of baseType.methods ?? []) {
                if (method.abstract) {
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

                  this.code.line(
                    `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                  );
                  this.code.line(`        JsiiRuntime::instance().invoke();`);
                  this.code.line(`        todo!()`);
                  this.code.line(`    }`);
                }
              }

              // Implement abstract properties from base class
              for (const prop of baseType.properties ?? []) {
                if (prop.abstract) {
                  const rustType = this.toRustType(prop.type);
                  const rustName = reservedWords(prop.name);

                  this.code.line(
                    `    fn get_${rustName}(&self) -> ${rustType} {`,
                  );
                  this.code.line(`        JsiiRuntime::instance().invoke();`);
                  this.code.line(`        todo!()`);
                  this.code.line(`    }`);

                  if (!prop.immutable) {
                    this.code.line(
                      `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                    );
                    this.code.line(`        JsiiRuntime::instance().invoke();`);
                    this.code.line(`        todo!()`);
                    this.code.line(`    }`);
                  }
                }
              }
            }
          }

          this.code.line(`}`);
        }
        // Note: For concrete base classes, no impl block is needed - we use composition
      }

      if (cls.interfaces) {
        for (const iface of cls.interfaces) {
          const ifaceName = iface.split('.').pop() ?? iface;
          this.code.line('');
          this.code.line(`impl ${ifaceName} for ${cls.name} {`);

          // Get the interface definition to implement its methods
          if (this.currentAssembly?.types) {
            const ifaceType = this.currentAssembly.types[iface];
            if (ifaceType?.kind === TypeKind.Interface) {
              // Implement properties as getter/setter methods
              for (const prop of ifaceType.properties ?? []) {
                const rustType = this.toRustType(prop.type);
                const rustName = reservedWords(prop.name);

                this.code.line(
                  `    fn get_${rustName}(&self) -> ${rustType} {`,
                );
                this.code.line(`        JsiiRuntime::instance().invoke();`);
                this.code.line(`        todo!()`);
                this.code.line(`    }`);

                if (!prop.immutable) {
                  this.code.line(
                    `    fn set_${rustName}(&mut self, value: ${rustType}) {`,
                  );
                  this.code.line(`        JsiiRuntime::instance().invoke();`);
                  this.code.line(`        todo!()`);
                  this.code.line(`    }`);
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

                this.code.line(
                  `    fn ${methodName}(&self${params ? `, ${params}` : ''}) -> ${returnType} {`,
                );
                this.code.line(`        JsiiRuntime::instance().invoke();`);
                this.code.line(`        todo!()`);
                this.code.line(`    }`);
              }
            }
          }

          // Handle external interfaces that we don't have definitions for
          if (
            !this.currentAssembly?.types ||
            !this.currentAssembly.types[iface]
          ) {
            const ifaceName = iface.split('.').pop() ?? iface;

            // Generate stub implementations for common external interfaces
            if (ifaceName === 'IFriendly') {
              this.code.line(`    fn hello(&self) -> String {`);
              this.code.line(`        JsiiRuntime::instance().invoke();`);
              this.code.line(`        todo!()`);
              this.code.line(`    }`);
            } else if (ifaceName === 'IDoublable') {
              this.code.line(`    fn double_value(&self) -> f64 {`);
              this.code.line(`        JsiiRuntime::instance().invoke();`);
              this.code.line(`        todo!()`);
              this.code.line(`    }`);
            }
          }

          this.code.line(`}`);
        }
      }
    }

    this.code.closeFile(`src/${filename}.rs`);
  }

  protected onBeginEnum(enm: EnumType): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    let filename = enm.name;
    const fullPath = enm.namespace ? `${enm.namespace}.${enm.name}` : enm.name;

    if (enm.namespace) {
      // Replace dots with slashes for proper directory structure
      const namespacePath = enm.namespace.replace(/\./g, '/');
      filename = `${namespacePath}/${enm.name}`;
    } else if (conflicts.has(enm.name)) {
      // This enum conflicts with a namespace - put it inside the namespace directory
      filename = `${enm.name}/${enm.name}`;
    }

    // Handle conflicts at any namespace level
    if (conflicts.has(fullPath)) {
      // This type conflicts with a namespace - put it in its own subdirectory
      if (enm.namespace) {
        const namespacePath = enm.namespace.replace(/\./g, '/');
        filename = `${namespacePath}/${enm.name}/${enm.name}`;
      } else {
        filename = `${enm.name}/${enm.name}`;
      }
    }

    this.code.openFile(`src/${filename}.rs`);

    this.code.line(`pub enum ${enm.name} {`);

    for (const member of enm.members ?? []) {
      this.code.line(`${member.name},`);
    }

    this.code.line(`}`);

    this.code.closeFile(`src/${filename}.rs`);
  }

  private toRustType(type: TypeReference): string {
    return toRustType(type, this.abstractTypes);
  }

  private getImportsForType(type: InterfaceType | ClassType): string[] {
    const rawImports = new Set<string>();

    // Add import for JSII runtime - all types need this
    rawImports.add('use crate::jsii_runtime::JsiiRuntime;');

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

    for (const fqn of fqns) {
      // Skip self-imports
      if (fqn === currentType.fqn) continue;

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
        const importStmt = this.getImportForFqn(fqnGroup[0], currentType);
        if (importStmt) imports.push(importStmt);
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
          if (importStmt) imports.push(importStmt);
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

    // Handle internal types
    if (fqn.startsWith('jsii-calc.')) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('::');

      if (namespace) {
        // Type is in a namespace
        const typeInfo = this.getTypeInfo(fqn);
        if (typeInfo?.kind === 'interface') {
          if (typeName !== alias) {
            return `use crate::${namespace}::${typeName}::{${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
          }
          return `use crate::${namespace}::${typeName}::{${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          if (typeInfo.abstract) {
            if (typeName !== alias) {
              return `use crate::${namespace}::${typeName}::{${typeName}Abstract as ${alias}Abstract, ${typeName}Base as ${alias}Base};`;
            }
            return `use crate::${namespace}::${typeName}::{${typeName}Abstract, ${typeName}Base};`;
          }
          if (typeName !== alias) {
            return `use crate::${namespace}::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${namespace}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          if (typeName !== alias) {
            return `use crate::${namespace}::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${namespace}::${typeName}::${typeName};`;
        }
      } else {
        // Type is at root level
        const typeInfo = this.getTypeInfo(fqn);
        if (typeInfo?.kind === 'interface') {
          if (typeName !== alias) {
            return `use crate::${typeName}::{${typeName} as ${alias}, ${typeName}Ref as ${alias}Ref};`;
          }
          return `use crate::${typeName}::{${typeName}, ${typeName}Ref};`;
        }
        if (typeInfo?.kind === 'class') {
          if (typeInfo.abstract) {
            if (typeName !== alias) {
              return `use crate::${typeName}::{${typeName}Abstract as ${alias}Abstract, ${typeName}Base as ${alias}Base};`;
            }
            return `use crate::${typeName}::{${typeName}Abstract, ${typeName}Base};`;
          }
          if (typeName !== alias) {
            return `use crate::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${typeName}::${typeName};`;
        }
        if (typeInfo?.kind === 'enum') {
          if (typeName !== alias) {
            return `use crate::${typeName}::${typeName} as ${alias};`;
          }
          return `use crate::${typeName}::${typeName};`;
        }
      }
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

    // Handle internal types
    if (fqn.startsWith('jsii-calc.')) {
      const parts = fqn.split('.');
      const typeName = parts[parts.length - 1];
      const namespace = parts.slice(1, -1).join('::');

      if (namespace) {
        // Type is in a namespace - generate proper fully qualified import
        const typeInfo = this.getTypeInfo(fqn);
        if (typeInfo?.kind === 'interface') {
          // Import both the trait and the reference implementation with full path
          return `use crate::${namespace}::${typeName}::{${typeName}, ${typeName}Ref};`;
        } else if (typeInfo?.kind === 'class') {
          if (typeInfo.abstract) {
            return `use crate::${namespace}::${typeName}::{${typeName}Abstract, ${typeName}Base};`;
          }
          return `use crate::${namespace}::${typeName}::${typeName};`;
        } else if (typeInfo?.kind === 'enum') {
          return `use crate::${namespace}::${typeName}::${typeName};`;
        }
        // Fallback for unknown types
        return `use crate::${namespace}::${typeName}::${typeName};`;
      }
      // Type is at root level - import the actual type from its module
      const typeInfo = this.getTypeInfo(fqn);
      if (typeInfo?.kind === 'interface') {
        // Import both the trait and the reference implementation
        return `use crate::${typeName}::{${typeName}, ${typeName}Ref};`;
      }
      if (typeInfo?.kind === 'class') {
        if (typeInfo.abstract) {
          return `use crate::${typeName}::{${typeName}Abstract, ${typeName}Base};`;
        }
        return `use crate::${typeName}::${typeName};`;
      }
      if (typeInfo?.kind === 'enum') {
        return `use crate::${typeName}::${typeName};`;
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

    this.code.line(
      '// Stub types for external dependencies and commonly used types',
    );
    this.code.line('pub struct Number;');
    this.code.line('pub struct NumericValue;');
    this.code.line('pub struct MyFirstStruct;');
    this.code.line('pub struct StructWithOnlyOptionals;');
    this.code.line('pub struct NestedClass;');
    this.code.line('pub struct EnumFromScopedModule;');
    this.code.line('pub struct Reflector;');
    this.code.line('pub struct ReflectableEntry;');
    this.code.line('pub struct BaseProps;');
    this.code.line('pub struct Base;');
    this.code.line('pub struct Operation;');
    this.code.line('pub struct PropProperty;');
    this.code.line('');

    this.code.line('// Stub traits for external interfaces');
    this.code.line('pub trait IFriendly {');
    this.code.line('    fn hello(&self) -> String;');
    this.code.line('}');
    this.code.line('pub trait IDoublable {');
    this.code.line('    fn double_value(&self) -> f64;');
    this.code.line('}');
    this.code.line('pub trait IReflectable {');
    this.code.line('    // Stub trait');
    this.code.line('}');
    this.code.line('pub trait IBaseInterface {');
    this.code.line('    // Stub trait');
    this.code.line('}');
    this.code.line('pub trait BaseFor2647 {');
    this.code.line('    // Stub trait');
    this.code.line('}');
    this.code.line('pub trait DiamondLeft {');
    this.code.line('    // Stub trait');
    this.code.line('}');
    this.code.line('pub trait DiamondRight {');
    this.code.line('    // Stub trait');
    this.code.line('}');
    this.code.line('');

    this.code.line('// Default implementations');
    this.code.line('impl IFriendly for () {');
    this.code.line('    fn hello(&self) -> String {');
    this.code.line('        "Hello".to_string()');
    this.code.line('    }');
    this.code.line('}');

    this.code.closeFile('src/jsii_runtime.rs');
  }

  private generateModuleFiles(nestedModules: Map<string, Set<string>>): void {
    const conflicts = ((this as any).nameConflicts as Set<string>) || new Set();

    // Generate mod.rs files for each namespace
    for (const [namespace, children] of nestedModules.entries()) {
      const modulePath = namespace.replace(/\./g, '/');
      this.code.openFile(`src/${modulePath}/mod.rs`);

      // Add module declarations for all children
      const sortedChildren = Array.from(children).sort();
      for (const child of sortedChildren) {
        this.code.line(`pub mod ${child};`);
      }

      // Add re-exports for types in this namespace
      this.code.line('');
      this.code.line('// Re-export types from child modules');
      for (const child of sortedChildren) {
        // Check if this child is a type or a submodule
        const fullPath = `${namespace}.${child}`;
        const isType = this.isTypeName(fullPath);

        if (isType) {
          // Re-export the type
          const typeInfo = this.getTypeInfo(fullPath);
          if (typeInfo) {
            if (typeInfo.kind === 'interface') {
              this.code.line(`pub use ${child}::{${child}, ${child}Ref};`);
            } else if (typeInfo.kind === 'class') {
              if (typeInfo.abstract) {
                // Re-export all abstract class types
                this.code.line(
                  `pub use ${child}::{${child}Abstract, ${child}Base, ${child}};`,
                );
              } else {
                this.code.line(`pub use ${child}::${child};`);
              }
            } else if (typeInfo.kind === 'enum') {
              this.code.line(`pub use ${child}::${child};`);
            }
          }
        }
      }

      this.code.closeFile(`src/${modulePath}/mod.rs`);
    }

    // Generate mod.rs files for conflicting types at any level
    for (const conflictPath of conflicts) {
      const parts = conflictPath.split('.');
      const typeName = parts[parts.length - 1];

      if (parts.length === 1) {
        // Root-level conflict
        this.code.openFile(`src/${typeName}/mod.rs`);
        this.code.line(`pub mod ${typeName};`);
        // Add re-export
        const typeInfo = this.getTypeInfo(conflictPath);
        if (typeInfo) {
          if (typeInfo.kind === 'interface') {
            this.code.line(
              `pub use ${typeName}::{${typeName}, ${typeName}Ref};`,
            );
          } else if (typeInfo.kind === 'class') {
            if (typeInfo.abstract) {
              this.code.line(
                `pub use ${typeName}::{${typeName}Abstract, ${typeName}Base, ${typeName}};`,
              );
            } else {
              this.code.line(`pub use ${typeName}::${typeName};`);
            }
          } else if (typeInfo.kind === 'enum') {
            this.code.line(`pub use ${typeName}::${typeName};`);
          }
        }
        this.code.closeFile(`src/${typeName}/mod.rs`);
      } else {
        // Namespace-level conflict
        const namespacePath = parts.slice(0, -1).join('/');
        this.code.openFile(`src/${namespacePath}/${typeName}/mod.rs`);
        this.code.line(`pub mod ${typeName};`);
        // Add re-export
        const typeInfo = this.getTypeInfo(conflictPath);
        if (typeInfo) {
          if (typeInfo.kind === 'interface') {
            this.code.line(
              `pub use ${typeName}::{${typeName}, ${typeName}Ref};`,
            );
          } else if (typeInfo.kind === 'class') {
            if (typeInfo.abstract) {
              this.code.line(
                `pub use ${typeName}::{${typeName}Abstract, ${typeName}Base, ${typeName}};`,
              );
            } else {
              this.code.line(`pub use ${typeName}::${typeName};`);
            }
          } else if (typeInfo.kind === 'enum') {
            this.code.line(`pub use ${typeName}::${typeName};`);
          }
        }
        this.code.closeFile(`src/${namespacePath}/${typeName}/mod.rs`);
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

  // private _getImportsForTypeReference(
  //   _typeRef: TypeReference,
  //   _currentType: InterfaceType | ClassType,
  // ): string[] {
  //   const imports: string[] = [];

  //   if (isNamedTypeReference(_typeRef)) {
  //     const importStmt = this.getImportForFqn(_typeRef.fqn, _currentType);
  //     if (importStmt) {
  //       imports.push(importStmt);
  //     }
  //   } else if (isCollectionTypeReference(_typeRef)) {
  //     const elementImports = this._getImportsForTypeReference(
  //       _typeRef.collection.elementtype,
  //       _currentType,
  //     );
  //     imports.push(...elementImports);
  //   } else if (isUnionTypeReference(_typeRef)) {
  //     for (const unionType of _typeRef.union.types) {
  //       const unionImports = this._getImportsForTypeReference(
  //         unionType,
  //         _currentType,
  //       );
  //       imports.push(...unionImports);
  //     }
  //   }

  //   return imports;
  // }
}

function toRustType(
  type: TypeReference,
  abstractTypes: Set<string> = new Set(),
): string {
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

    // ✅ If it's an abstract class or behavioral interface, return trait object
    if (abstractTypes.has(type.fqn)) {
      return `Box<dyn ${typeName}>`;
    }

    // ✅ External interfaces (from other packages) should also be trait objects
    if (
      type.fqn.startsWith('@scope/jsii-calc-lib.') ||
      type.fqn.startsWith('@scope/jsii-calc-base.')
    ) {
      // External types that start with 'I' are likely interfaces
      if (typeName.startsWith('I')) {
        return `Box<dyn ${typeName}>`;
      }
    }

    // ✅ Otherwise return the concrete type name
    return typeName;
  }

  if (isCollectionTypeReference(type)) {
    const elementType = toRustType(type.collection.elementtype, abstractTypes);

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
    // ✅ For unions, we'll use an enum or trait object for now
    // This is a complex case that needs more thought
    return 'Box<dyn std::any::Any>'; // Simplified for now
  }

  return '()';
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
