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
      emitMethod(code, method, this.type.assembly.name);
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
