import { Assembly } from "jsii-reflect";
import { IGenerator, Legalese } from "../generator";
import { Target, TargetOptions } from "../target";
import { Crate } from "./rust/crate";
import path = require("path");
import { CodeMaker } from "codemaker";
import * as fs from 'fs-extra';
import { tarballName } from "./rust/util";

export class Rust extends Target {
  protected readonly generator: RustGenerator;

  public constructor(options: TargetOptions) {
    super(options);
    this.generator = new RustGenerator();
  }

  public async build(sourceDir: string, outDir: string): Promise<void> {
    await this.copyFiles(sourceDir, outDir);
  }
}

class RustGenerator implements IGenerator {
  private assembly!: Assembly;
  private crate!: Crate;

  private readonly code = new CodeMaker({
    indentCharacter: ' ',
    indentationLevel: 4
  });

  public generate(_fingerprint: boolean): void {
    this.crate = new Crate(this.assembly);
  }

  public async load(_packageDir: string, assembly: Assembly): Promise<void> {
    this.assembly = assembly;
  }

  public async upToDate(_outDir: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  public async save(outdir: string, tarball: string, { license, notice }: Legalese): Promise<any> {
    const output = path.join(outdir, this.crate.name);
    await this.code.save(output);

    const jsiiDir = path.join(output, 'jsii');
    await fs.ensureDir(jsiiDir);

    await fs.copyFile(
      tarball,
      path.join(jsiiDir, tarballName(this.assembly)),
    )

    if (license) {
      await fs.writeFile(path.join(output, 'LICENSE'), license, {
        encoding: 'utf8',
      });
    }

    if (notice) {
      await fs.writeFile(path.join(output, 'NOTICE'), notice, {
        encoding: 'utf8',
      });
    }
  }
}