import { EnumType } from "jsii-reflect";
import { RustType } from "../rust-type";
import { CodeMaker } from "codemaker";

// TODO: Should it be enum variants or jsii-runtime calls?
export class RustEnum extends RustType<EnumType> {
    public emit(code: CodeMaker) {
        code.line('#[derive(PartialEq, Debug)]')
        code.openBlock(`pub enum ${this.type.name}`);
        for (const member of this.type.members) {
            code.line(`${this.snakeToCamelCase(member.name)},`);
        }
        code.closeBlock();
        code.line();
    }

    private snakeToCamelCase(input: string): string {
        return input.toLowerCase()
            .split('_')
            .map((part, index) => 
                index === 0 
                    ? part.charAt(0).toUpperCase() + part.slice(1) 
                    : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join('');
    }
}