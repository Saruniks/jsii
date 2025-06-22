import { Assembly } from "jsii-reflect";
import { IGenerator, Legalese } from "../generator";
import { findLocalBuildDirs, Target, TargetOptions } from "../target";
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

    // const pkgDir = path.join(outDir, this.generator.rootCrate.moduleName);

    // const dirs = [
    //   path.dirname(outDir),
    //   ...(await findLocalBuildDirs(this.packageDir, 'rust')),
    // ];

    // console.log(`Found dirs:`);
    // for (const dir of dirs) {
    //   console.log(`  - ${dir}`);
    // }  
  }
}

class RustGenerator implements IGenerator {
  public rootCrate!: Crate;
  
  private assembly!: Assembly;

  private readonly code = new CodeMaker({
    indentCharacter: ' ',
    indentationLevel: 4
  });

  public generate(_fingerprint: boolean): void {
    this.rootCrate = new Crate(this.assembly);
    this.rootCrate. emit(this.code);
  }

  public async load(_packageDir: string, assembly: Assembly): Promise<void> {
    this.assembly = assembly;
  }

  public async upToDate(_outDir: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  public async save(outdir: string, tarball: string, { license, notice }: Legalese): Promise<any> {
    await this.code.save(outdir);
    
    const output = path.join(outdir, this.rootCrate.moduleName);

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