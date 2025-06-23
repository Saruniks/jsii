import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";
import { makeRustProperty } from "./rust-types";
import { makeRustPropertyName } from "../util";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    code.line(`pub struct ${this.type.name};`);
    code.line();
    code.openBlock(`impl ${this.type.name}`);
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
