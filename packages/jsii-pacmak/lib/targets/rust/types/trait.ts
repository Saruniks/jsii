import { CodeMaker } from "codemaker";
import { RustType } from "../rust-type";
import { InterfaceType, Method } from "jsii-reflect";
import { emitMethod } from "./method";
import { makeRustPropertyName, substituteReservedWords } from "../util";

export class RustTrait extends RustType<InterfaceType> {
    public emit(code: CodeMaker) {
        // Generate the trait
        code.openBlock(`pub trait ${this.type.name}`);

        Object.values(this.type.getMethods()).forEach((method: Method) => {
            // TODO: Can we check if parentType of actual method is InterfaceType correctly?
            emitMethod(code, method, this.type.fqn, this.type.assembly.name, true);
        });

        code.closeBlock();
        code.line();

        // Generate a concrete wrapper implementation for serialization
        code.line('#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]');
        code.openBlock(`pub struct ${this.type.name}Impl`);
        code.line('pub jsii_object_ref: String,');
        code.closeBlock();
        code.line();

        // Implement the trait for the concrete type
        code.openBlock(`impl ${this.type.name} for ${this.type.name}Impl`);
        Object.values(this.type.getMethods()).forEach((method: Method) => {
            // Generate concrete implementations that delegate to JSII runtime
            // Pass true for isRustInterface because we're implementing a trait (interface)
            emitMethod(code, method, this.type.fqn, this.type.assembly.name, true);
        });
        code.closeBlock();
        code.line();

        // Add constructor for the concrete type
        code.openBlock(`impl ${this.type.name}Impl`);
        code.openBlock(`pub fn from_jsii_object_ref(jsii_object_ref: String) -> Self`);
        code.line(`Self { jsii_object_ref }`);
        code.closeBlock();
        code.line();
        
        code.openBlock(`pub fn get_jsii_object_ref(&self) -> &str`);
        code.line(`&self.jsii_object_ref`);
        code.closeBlock();
        code.closeBlock();
        code.line();
    }
}
