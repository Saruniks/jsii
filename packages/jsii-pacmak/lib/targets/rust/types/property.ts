// export class RustType {
// }

import { Property } from "jsii-reflect";
import { substituteReservedWords } from "../util";

export function makeRustProperty(property: Property): string {
    const propertyName = substituteReservedWords(property.name); 
    return `${propertyName}: (),`
}
