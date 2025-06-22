import { CodeMaker } from "codemaker";
import { RustType } from "../rust-type";
import { InterfaceType, Method } from "jsii-reflect";

export class RustTrait extends RustType<InterfaceType> {
    public emit(code: CodeMaker) {
        code.openBlock(`pub trait ${this.type.name}`);

        Object.keys(this.type.getMethods()).forEach((name: string) => {
            code.openBlock(`fn ${name}(&self)`);
            code.line(`todo!();`);
            code.closeBlock();
        });

        code.closeBlock();
    }
}
