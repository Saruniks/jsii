import { CodeMaker } from "codemaker";
import { RustType } from "../rust-type";
import { InterfaceType, Method } from "jsii-reflect";
import { emitMethod } from "./method";

export class RustTrait extends RustType<InterfaceType> {
    public emit(code: CodeMaker) {
        code.openBlock(`pub trait ${this.type.name}`);

        Object.values(this.type.getMethods()).forEach((method: Method) => {
            // TODO: Can we check if parentType of actual method is InterfaceType correctly?
            emitMethod(code, method, this.type.fqn, this.type.assembly.name, true);
        });

        code.closeBlock();
        code.line();
    }
}
