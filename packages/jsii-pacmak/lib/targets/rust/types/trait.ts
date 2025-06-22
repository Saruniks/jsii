import { CodeMaker } from "codemaker";
import { RustType } from "../rust-type";
import { InterfaceType } from "jsii-reflect";

export class RustTrait extends RustType<InterfaceType> {
    public emit(code: CodeMaker) {
        code.openBlock(`pub trait ${this.type.name}`);
        // Emit tait methods here
        code.closeBlock();
    }
}
