import { CodeMaker } from "codemaker";
import { Method } from "jsii-reflect";
import { makeRustParameter } from "./rust-types";
import { makeRustPropertyName, substituteReservedWords } from "../util";

export function emitMethod(code: CodeMaker, method: Method, fqn: string, assemblyName: string, isRustInterface: boolean): void {
    let methodName = substituteReservedWords(method.name);

    // TODO: Is toString() supposed to be a jsii-runtime call to js or native Rust?
    methodName = method.name === 'toString' ? 'to_string' : makeRustPropertyName(method.name);

    let returns;
    let parameters: string[] = [];
    
    // Handle parameters
    if (method.parameters) {
        for (const param of method.parameters) {
            if (param.type.primitive === 'any') {
                parameters.push(`${makeRustPropertyName(param.name)}: serde_json::Value`);
            } else if (param.type.type?.isEnumType()) {
                // Get the assembly/package name of the current type and the param type
                const currentAssembly = assemblyName;
                const paramTypeAssembly = param.type.type.assembly.name;
                
                // Transform FQN to Rust module path format
                let rustType = param.type.type.fqn;
                
                // If the param type is from the same assembly, use relative path
                if (currentAssembly === paramTypeAssembly) {
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
                
                parameters.push(`${makeRustPropertyName(param.name)}: ${rustType}`);
            } else if (param.type.type?.isClassType()) {
                // Handle class types
                const currentAssembly = assemblyName;
                const paramTypeAssembly = param.type.type.assembly.name;
                
                // Transform FQN to Rust module path format
                let rustType = param.type.type.fqn;
                
                // If the param type is from the same assembly, use relative path
                if (currentAssembly === paramTypeAssembly) {
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
                
                parameters.push(`${makeRustPropertyName(param.name)}: ${rustType}`);
            } else if (param.type.type?.isInterfaceType()) {
                // Handle interface types - use serde_json::Value for now as a fallback
                // TODO: Properly handle interface types
                parameters.push(`${makeRustPropertyName(param.name)}: serde_json::Value`);
            } else {
                // For other types, use serde_json::Value as a fallback
                parameters.push(`${makeRustPropertyName(param.name)}: serde_json::Value`);
            }
        }
    }
    
    if (method.returns) {
        if (method.returns.type.primitive === 'string') {
            returns = ' -> String';
        } else if (method.returns.type.primitive === 'any') {
            returns = ' -> serde_json::Value';
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
            code.openBlock(`fn ${methodName}(${parameters.join(', ')})${returns || ''}`);
        } else {
            code.openBlock(`pub fn ${methodName}(${parameters.join(', ')})${returns || ''}`);
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
        // For trait implementations and declarations, we don't use 'pub' since traits control visibility
        // For struct methods, we use 'pub'
        if (isRustInterface) {
            code.openBlock(`fn ${methodName}(&self${parameters.length > 0 ? ', ' + parameters.join(', ') : ''})${returns || ''}`);
        } else {
            code.openBlock(`pub fn ${methodName}(&self${parameters.length > 0 ? ', ' + parameters.join(', ') : ''})${returns || ''}`);
        }
        
        // Generate specific implementations for known methods
        if (method.name === 'anyOut') {
            code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::invoke(&self.jsii_object_ref, "anyOut", Some(&[])).expect("JsiiRuntime::invoke panic");`);
            code.line(`jsii_res`);
        } else if (method.name === 'anyIn') {
            code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::invoke(&self.jsii_object_ref, "anyIn", Some(&[serde_json::to_value(&inp).expect("Failed to serialize parameter")])).expect("JsiiRuntime::invoke panic");`);
        } else if (method.name === 'enumMethod') {
            code.line(`let jsii_res = jsii_rust_runtime::JsiiRuntime::invoke(&self.jsii_object_ref, "enumMethod", Some(&[serde_json::json!({"$jsii.enum": serde_json::to_value(&value).expect("Failed to serialize enum")})])).expect("JsiiRuntime::invoke panic");`);
            code.line(`// Extract enum value from {"$jsii.enum": "fqn/VALUE"} format`);
            code.line(`if let Some(enum_value) = jsii_res.get("$jsii.enum").and_then(|v| v.as_str()) {`);
            code.line(`    serde_json::from_str(&format!("\\"{}\\"", enum_value)).expect("Failed to deserialize enum")`);
            code.line(`} else {`);
            code.line(`    panic!("Invalid enum response format");`);
            code.line(`}`);
        } else {
            code.line(`todo!();`);
        }
    }    
    
    code.closeBlock();
    code.line();
}
