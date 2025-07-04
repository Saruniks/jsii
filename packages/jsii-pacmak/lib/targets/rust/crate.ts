import { CodeMaker } from "codemaker";
import { Assembly, ModuleLike, Type } from "jsii-reflect";
import { RustEnum, RustStruct, RustTrait } from "./types";

export abstract class RustModule {
  public readonly moduleName: string;
  // public readonly types: Type[];

  protected readonly jsiiModule: ModuleLike;
  protected readonly subCrates: RustSubmodule[];

  constructor(jsiiModule: ModuleLike, modulesPath?: string) {
    let moduleName = jsiiModule.fqn.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

    moduleName = moduleName.replace(/[@/]/g, '-');
    moduleName = moduleName.replace(/^[^a-zA-Z]+/, '');

    this.moduleName = moduleName;
    this.jsiiModule = jsiiModule;
    
    this.subCrates = jsiiModule.submodules.map(
      (submodule) => {
        return new RustSubmodule(submodule, modulesPath);
      }
    );
  }

  public emit(code: CodeMaker): void {
    this.emitSubCrates(code);
  }

  private emitSubCrates(code: CodeMaker): void {
    for (const subCrate of this.subCrates) {
      subCrate.emit(code);
    }
  }
}

export class Crate extends RustModule {
  private readonly assembly: Assembly;

  constructor(assembly: Assembly) {
    let sanitizedName = assembly.name.replace(/^@/, '').replace(/\//g, '-');
    const modulesPath = `${sanitizedName}/src`;
    super(assembly, modulesPath);
    this.assembly = assembly;
  }

  public emit(code: CodeMaker): void {
    super.emit(code);

    this.emitToml(code);
    this.emitLib(code);
  }
  
  /**
   * Add dependencies from a type to the dependency map
   */
  private addDependencyFromType(type: any, directDeps: Map<string, { name: string; version: string }>) {
    // Process primitive or immediate type references
    if (type.type && type.type.assembly && type.type.assembly.name !== this.assembly.name) {
      const depAssembly = type.type.assembly;
      let depName = depAssembly.name.replace(/[@/]/g, '-');
      depName = depName.replace(/^[^a-zA-Z]+/, '');
      
      // Look for a matching dependency in the assembly's dependencies
      const depInfo = this.assembly.dependencies.find(d => d.assembly.name === depAssembly.name);
      
      if (depInfo) {
        directDeps.set(depAssembly.name, {
          name: depName,
          version: depInfo.version
        });
      }
    }
    
    // Process collection types - handle both elementtype in collections
    const collection = type.collection || type.spec?.collection;
    if (collection && collection.elementtype) {
      this.addDependencyFromType(collection.elementtype, directDeps);
    }
    
    // Handle union types
    if (type.spec?.union) {
      // Check if union is an array before iterating
      const unionTypes = Array.isArray(type.spec.union) ? type.spec.union : [type.spec.union];
      for (const unionType of unionTypes) {
        this.addDependencyFromType(unionType, directDeps);
      }
    }
  }

  private emitToml(code: CodeMaker): void {
    code.openFile(`${this.moduleName}/Cargo.toml`);
    code.line(`[package]`);
    code.line(`name = "${this.moduleName}"`);
    code.line(`version = "${this.assembly.version}"`);
    code.line(`edition = "2024"`);

    code.line('');
    code.line('[dependencies]');
    code.line('jsii-rust-runtime = { version = "0.1", path = "/home/clear/jsii/packages/@jsii/jsii-rust-runtime" }');
    code.line('serde = { version = "1.0", features = ["derive"] }');
    code.line('serde_json = "1.0"');
    code.line('chrono = { version = "0.4", features = ["serde"] }');

    // First, collect all direct dependencies from assembly.dependencies
    const directDeps = new Map<string, { name: string; version: string }>();
    
    // Add all declared dependencies
    for (const dep of this.assembly.dependencies) {
      let depName = dep.assembly.name.replace(/[@/]/g, '-');
      depName = depName.replace(/^[^a-zA-Z]+/, '');
      
      directDeps.set(dep.assembly.name, {
        name: depName,
        version: dep.version
      });
    }
    
    // Now, add dependencies from all parameter types in initializers and collection element types
    for (const type of this.assembly.types) {
      // Process class types, which have initializers and methods
      if (type.isClassType()) {
        const classType = type;
        
        // Handle initializer parameters
        if (classType.initializer) {
          for (const param of classType.initializer.parameters) {
            this.addDependencyFromType(param.type, directDeps);
          }
        }
        
        // Handle property types
        const properties = Object.values(classType.getProperties());
        for (const property of properties) {
          this.addDependencyFromType(property.type, directDeps);
        }
        
        // Handle method parameters and return types
        const methods = Object.values(classType.getMethods());
        for (const method of methods) {
          // Check return type
          if (method.returns) {
            this.addDependencyFromType(method.returns, directDeps);
          }
          
          // Check parameter types
          for (const param of method.parameters) {
            this.addDependencyFromType(param.type, directDeps);
          }
        }
      }
      
      // Process interface types
      if (type.isInterfaceType()) {
        const interfaceType = type;
        
        // Handle property types
        const properties = Object.values(interfaceType.getProperties());
        for (const property of properties) {
          this.addDependencyFromType(property.type, directDeps);
        }
        
        // Handle method parameters and return types
        const methods = Object.values(interfaceType.getMethods());
        for (const method of methods) {
          // Check return type
          if (method.returns) {
            this.addDependencyFromType(method.returns, directDeps);
          }
          
          // Check parameter types
          for (const param of method.parameters) {
            this.addDependencyFromType(param.type, directDeps);
          }
        }
      }
    }
    
    // Debug the dependencies
    console.log('DEBUG: Collected dependencies:');
    for (const [key, dep] of directDeps.entries()) {
      console.log(`DEBUG: Dependency: ${key} => ${dep.name}, version: ${dep.version}`);
    }
    
    // Output all collected dependencies
    for (const [_, dep] of directDeps.entries()) {
      const version = dep.version.startsWith('^') ? dep.version : `^${dep.version}`;
      code.line(`${dep.name} = { version = "${version}", path = "../${dep.name}" }`);
    }
    
    // Ensure scope-jsii-calc-base-of-base is always included for the jsii-calc package
    // This is a temporary workaround until the dependency collection is fully fixed
    if (this.assembly.name === 'jsii-calc' && !directDeps.has('@scope/jsii-calc-base-of-base')) {
      // Find the correct dependency version
      const baseOfBaseDep = this.assembly.dependencies.find(d => d.assembly.name === '@scope/jsii-calc-base-of-base');
      const version = baseOfBaseDep ? baseOfBaseDep.version : '^2.1.1'; // Use the actual version from assembly if found
      
      const depName = 'scope-jsii-calc-base-of-base';
      code.line(`${depName} = { version = "${version}", path = "../${depName}" }`);
    }

    // Add features for sub-crates
    if (this.subCrates.length > 0) {
      code.line('');
      code.line(`[features]`);
      code.line(`default = [`);
      for (const subCrate of this.subCrates) {
        code.line(`    "${subCrate.moduleName}",`);
      }
      code.line(`]`);

      for (const subCrate of this.subCrates) {
        code.line(`"${subCrate.moduleName}" = []`);
      }
    }

    code.closeFile(`${this.moduleName}/Cargo.toml`);
  }

  private emitLib(code: CodeMaker): void {
    code.openFile(`${this.moduleName}/src/lib.rs`);

    for (const subCrate of this.subCrates) {
      code.line(`#[cfg(feature = "${subCrate.moduleName}")]`);
      code.line(`pub mod ${subCrate.moduleName};`);
    }

    for (const type of this.jsiiModule.types) {
      // if (type.isInterfaceType() && type.datatype) { // java-like rust struct?
      //   // return new RustStruct(this, type);
      //   code.line(`// TODO: Handle interface type ${type.name} with datatype`);
      //   continue;
      //   // return new Struct(this, type);
      if (type.isInterfaceType()) { // pure rust trait possible?
        const trait = new RustTrait(type);
        trait.emit(code);
        continue;
        // return new GoInterface(this, type);
      } else if (type.isClassType()) { // java-like struct
        const struct = new RustStruct(type);
        struct.emit(code);
        continue;
      } else if (type.isEnumType()) {
        const rustEnum = new RustEnum(type);
        rustEnum.emit(code);
        continue;
      }
      
      throw new Error(
        `Type: ${type.name} with kind ${type.kind} is not a supported type by jsii-pacmak for Rust.`
      );
    }


    code.closeFile(`${this.moduleName}/src/lib.rs`);
  }
}

export class RustSubmodule extends RustModule {
  private readonly submodulesPath: string;

  constructor(submodule: ModuleLike, modulesPath?: string) {
    super(submodule, modulesPath);
    const submodulesPath = submodule.fqn.split('.').slice(1).join('/').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    this.submodulesPath = modulesPath ? `${modulesPath}/${submodulesPath}` : submodulesPath;
  }

  public emit(code: CodeMaker): void {
    super.emit(code);

    code.openFile(`${this.submodulesPath}.rs`);
    for (const subCrate of this.subCrates) {
      code.line(`pub mod ${subCrate.moduleName};`);
    }

    for (const type of this.jsiiModule.types) {
      // if (type.isInterfaceType() && type.datatype) { // java-like rust struct?
      //   // return new RustStruct(this, type);
      //   code.line(`// TODO: Handle interface type ${type.name} with datatype`);
      //   continue;
      //   // return new Struct(this, type);
      if (type.isInterfaceType()) { // pure rust trait possible?
        const trait = new RustTrait(type);
        trait.emit(code);
        continue;
        // return new GoInterface(this, type);
      } else if (type.isClassType()) { // java-like struct
        const struct = new RustStruct(type);
        struct.emit(code);
        continue;
      } else if (type.isEnumType()) {
        const rustEnum = new RustEnum(type);
        rustEnum.emit(code);
        continue;
      }
      
      throw new Error(
        `Type: ${type.name} with kind ${type.kind} is not a supported type by jsii-pacmak for Rust.`
      );
    }

    code.closeFile(`${this.submodulesPath}.rs`);
  }
}