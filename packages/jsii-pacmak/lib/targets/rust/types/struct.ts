import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";
import { makeRustPropertyName, substituteReservedWords } from "../util";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    if (!this.type.initializer) {
      code.openBlock(`pub struct ${this.type.name}`);
      code.line('// _private field is used to prevent instantiation of this struct');
      code.line(`_private: (),`);
      code.closeBlock();
    } else {
      code.line(`pub struct ${this.type.name};`);
    }
    code.line();

    code.openBlock(`impl ${this.type.name}`);

    if (this.type.initializer) {
      code.openBlock(`pub fn new() -> Self`);
      code.line(`Self`);
      code.closeBlock();
      code.line();
    }

    for (const method of this.type.ownMethods) {
      // TODO: Is toString() supposed to be a jsii-runtime call to js or native Rust?
      const methodName = method.name === 'toString' ? 'to_string' : makeRustPropertyName(method.name);

      let returns;
      if (method.returns) {
        if (method.returns.type.primitive === 'string') {
          returns = ' -> String';
        } else if (method.returns.type.type?.isEnumType()) {
          // Get the assembly/package name of the current type and the return type
          const currentAssembly = this.type.assembly.name;
          const returnTypeAssembly = method.returns.type.type.assembly.name;
          
          // Transform FQN to Rust module path format
          let rustType = method.returns.type.type.fqn;
          
          // If the return type is from the same assembly, use relative path
          if (currentAssembly === returnTypeAssembly) {
            // Extract just the type name without the package prefix
            rustType = rustType.split('.').pop()!;
            rustType = `crate::${rustType}`;
          } else {
            // Otherwise use the full path with the proper Rust module syntax
            rustType = rustType
              // Convert @scope/package to scope_package (with underscores)
              .replace(/^@([^/]+)\/([^.]+)\./, '$1_$2::')
              // Replace remaining dashes with underscores
              .replace(/-/g, '_')
              // Convert package.Type to package::Type
              .replace(/\./g, '::');
          }
          
          returns = ` -> ${rustType}`;
        }
      }

      if (method.static) {
        code.openBlock(`pub fn ${methodName}()${returns || ''}`);
      } else {
        code.openBlock(`pub fn ${methodName}(&self)${returns || ''}`);
      }
      code.line(`todo!();`);
      code.closeBlock();
      code.line();
    }

    for (const property of this.type.ownProperties) {
        code.openBlock(`fn get_${makeRustPropertyName(property.name)}(&self) -> ()`);
        code.line(`todo!();`);
        code.closeBlock();
        code.line();

        code.openBlock(`fn set_${makeRustPropertyName(property.name)}(&mut self, value: ())`);
        code.line(`todo!();`);
        code.closeBlock();
        code.line();
    }
    code.closeBlock();
    code.line();
  }
}
