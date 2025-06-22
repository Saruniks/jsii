import { CodeMaker } from "codemaker";
import { Type } from "jsii-reflect";

export abstract class RustType<T extends Type = Type> {
    public readonly type: T;
    
    constructor(type: T) {
        this.type = type;
    }

    public abstract emit(code: CodeMaker): void;
} 