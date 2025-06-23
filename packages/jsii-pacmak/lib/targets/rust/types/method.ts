import { CodeMaker } from "codemaker";
import { Method } from "jsii-reflect";
import { makeRustParameter } from "./rust-types";
import { substituteReservedWords } from "../util";

export function emitMethod(code: CodeMaker, method: Method): void {
    const methodName = substituteReservedWords(method.name);

    code.line(`fn ${methodName}(&self,`);
    
    for (const parameter of method.parameters) {
        code.line(makeRustParameter(parameter));
    }

    // TODO: Handle optional
    if (method.returns) {
        code.openBlock(`) -> ()`);
        // code.openBlock(`) -> ${method.returns.type}`);
    } else {
        code.openBlock(`)`);
    }
    code.line(`todo!();`);
    code.closeBlock();
    code.line();
}
