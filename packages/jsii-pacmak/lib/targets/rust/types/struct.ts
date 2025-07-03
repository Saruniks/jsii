import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";
import { makeRustPropertyName, substituteReservedWords } from "../util";
import { emitMethod } from "./method";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    if (!this.type.initializer) {
      code.openBlock(`pub struct ${this.type.name}`);
      code.line('// _private field is used to prevent instantiation of this struct');
      code.line(`_private: (),`);
      code.closeBlock();
    } else {
      code.openBlock(`pub struct ${this.type.name}`);
      // TODO: Should jsii_object be something else than String?
      code.line('jsii_object_ref: String');
      code.closeBlock();
    }
    code.line();

    code.openBlock(`impl ${this.type.name}`);

    if (this.type.initializer) {
      code.openBlock(`pub fn new() -> Self`);
      code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::create_object("${this.type.fqn}", Some(&[])).expect("JsiiRuntiem::create_object panic");`);
      code.line(`Self { jsii_object_ref: jsii_res }`);
      code.closeBlock();
      code.line();
    }

    for (const method of this.type.ownMethods) {
      // TODO: Can we check if parentType of actual method is InterfaceType correctly?
      emitMethod(code, method, this.type.fqn, this.type.assembly.name, false);
    }

    for (const property of this.type.ownProperties) {
        // if (property.name === 'booleanValue') {
          // code.line('fail compile');
        // }
        code.openBlock(`pub fn get_${makeRustPropertyName(property.name)}(&self) -> ${makeRustType(property.type)}`);

        // TODO: Handle different property types and static properties
        if (property.type.primitive && this.type.initializer) {
          // invoke the jsii runtime to call the method
          code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::get(&self.jsii_object_ref, "${substituteReservedWords(property.name)}").expect("JsiiRuntiem::invoke panic");`);
          code.line(`serde_json::from_str(&jsii_res).expect("Failed to deserialize result")`);
        } else {
          code.line(`todo!();`);
        }

        code.closeBlock();
        code.line();

        code.openBlock(`pub fn set_${makeRustPropertyName(property.name)}(&self, value: ${makeRustType(property.type)})`);

        if (this.type.initializer) {
          code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::set(&self.jsii_object_ref, "${substituteReservedWords(property.name)}", &serde_json::to_string(&value).expect("Failed to serialize value")).expect("JsiiRuntiem::invoke panic");`);
        } else {
          code.line(`todo!();`);
        }
        code.closeBlock();
        code.line();
    }
    code.closeBlock();
    code.line();
  }
}

function makeRustType(type: any): string {
  if (type.primitive === 'string') {
    return 'String';
  } else if (type.primitive === 'number') {
    // TODO: What number do we actually use here?
    // For now, we assume f64 (double precision float)
    return 'f64';
  } else if (type.primitive === 'boolean') {
    // invoke the jsii runtime to call the method
    // handle boolean return type
    return 'bool';
  } else if (type.type?.isEnumType()) {
    // // Get the assembly/package name of the current type and the return type
    // const currentAssembly = type.assembly.name;
    // const returnTypeAssembly = type.type.assembly.name;

    // // Transform FQN to Rust module path format
    // let rustType = type.type.fqn;

    // // If the return type is from the same assembly, use relative path
    // if (currentAssembly === returnTypeAssembly) {
    //   // Extract just the type name without the package prefix
    //   rustType = rustType.split('.').pop()!;
    //   rustType = `crate::${rustType}`;
    // } else {
    //   // Otherwise use the full path with the proper Rust module syntax
    //   rustType = rustType
    //     .replace(/^@([^/]+)\/([^.]+)\./, '$1_$2::')
    //     .replace(/-/g, '_')
    //     .replace(/\./g, '::');
    // }

    // return rustType;
  }
  return '()'; // Default case for unsupported types
}