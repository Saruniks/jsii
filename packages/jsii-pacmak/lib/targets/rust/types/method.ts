import { CodeMaker } from "codemaker";
import { Method } from "jsii-reflect";
import { makeRustParameter } from "./rust-types";
import { makeRustPropertyName, substituteReservedWords } from "../util";

export function emitMethod(code: CodeMaker, method: Method, fqn: string, assemblyName: string, isRustInterface: boolean): void {
    let methodName = substituteReservedWords(method.name);

    // TODO: Is toString() supposed to be a jsii-runtime call to js or native Rust?
    methodName = method.name === 'toString' ? 'to_string' : makeRustPropertyName(method.name);

    let returns;
    if (method.returns) {
        if (method.returns.type.primitive === 'string') {
            returns = ' -> String';
        } else if (method.returns.type.type?.isEnumType()) {
            // Get the assembly/package name of the current type and the return type
            const currentAssembly = assemblyName;
            const returnTypeAssembly = method.returns.type.type.assembly.name;
            
            // Transform FQN to Rust module path format
            let rustType = method.returns.type.type.fqn;
            
            // If the return type is from the same assembly, use relative path
            if (currentAssembly === returnTypeAssembly) {
            // Extract just the type name without the package prefix
            rustType = rustType.split('.').pop()!;
            rustType = `crate::${rustType}`;
            } else {
            // Otherwise use the full path with the proper Rust module syntax
            rustType = rustType
                // Convert @scope/package to scope_package (with underscores)
                .replace(/^@([^/]+)\/([^.]+)\./, '$1_$2::')
                // Replace remaining dashes with underscores
                .replace(/-/g, '_')
                // Convert package.Type to package::Type
                .replace(/\./g, '::');
            }
            
            returns = ` -> ${rustType}`;
        }
    }
    if (method.static) {
        if (isRustInterface) {
            code.openBlock(`fn ${methodName}()${returns || ''}`);
        } else {
            code.openBlock(`pub fn ${methodName}()${returns || ''}`);
        }
        // TODO: Invoke the jsii runtime to call the method
        code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::invoke_static("${fqn}", "${method.name}", Some(&[])).expect("JsiiRuntiem::invoke_static panic");`);
        code.line(`println!("Result: {:?}", jsii_res);`);

        if (method.name === 'randomStringLikeEnum' || method.name === 'randomIntegerLikeEnum') {
            // TODO: Deserialize without serde_json, just do Deserialize (use serde derive macro)
            code.line(`serde_json::from_str(&jsii_res).expect("Failed to deserialize result")`);
        } else {
            code.line('todo!();');
        }
    } else {
        if (isRustInterface) {
            code.openBlock(`fn ${methodName}(&self)${returns || ''}`);
        } else {
            code.openBlock(`pub fn ${methodName}(&self)${returns || ''}`);
        }
        code.line(`todo!();`);
    }    
    
    code.closeBlock();
    code.line();
}
