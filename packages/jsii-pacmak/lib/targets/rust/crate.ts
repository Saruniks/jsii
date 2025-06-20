import { Assembly } from "jsii-reflect";

export class Crate {
  public readonly name: string;

  constructor(assembly: Assembly) {
    this.name = assembly.name;
  }
}
