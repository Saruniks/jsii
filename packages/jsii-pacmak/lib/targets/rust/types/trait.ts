import { CodeMaker } from "codemaker";
import { RustType } from "../rust-type";
import { InterfaceType, Method } from "jsii-reflect";

export class RustTrait extends RustType<InterfaceType> {
    public emit(code: CodeMaker) {
        code.openBlock(`pub trait ${this.type.name}`);

        Object.values(this.type.getMethods()).forEach((method: Method) => {
            code.openBlock(`fn ${method.name}(&self)`);
            code.line(`todo!();`);
            code.closeBlock();
        });

        code.closeBlock();
    }
}
