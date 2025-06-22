import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";
import { makeRustProperty } from "./property";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    code.openBlock(`pub struct ${this.type.name}`);
    for (const property of this.type.ownProperties) {
        code.line(makeRustProperty(property));
    }
    code.closeBlock();
  }
}
