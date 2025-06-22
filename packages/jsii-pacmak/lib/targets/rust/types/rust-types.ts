// export class RustType {
// }

import { Parameter, Property } from "jsii-reflect";
import { substituteReservedWords } from "../util";

export function makeRustProperty(property: Property): string {
    const propertyName = substituteReservedWords(property.name); 
    return `${propertyName}: (),`
}

export function makeRustParameter(parameter: Parameter): string {
    const parameterName = substituteReservedWords(parameter.name);
    return `${parameterName}: ()`;
}