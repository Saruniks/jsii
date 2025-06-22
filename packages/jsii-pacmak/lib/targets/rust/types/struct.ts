import { CodeMaker } from "codemaker";
import { ClassType } from "jsii-reflect"
import { RustType } from "../rust-type";

export class RustStruct extends RustType<ClassType> {
  public emit(code: CodeMaker) {
    code.openBlock(`pub struct ${this.type.name}`);
    // Emit struct fields here
    code.closeBlock();
  }
}
