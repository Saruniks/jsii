import { Assembly } from 'jsii-reflect';

import { IGenerator, Legalese } from '../generator';
import { Target, TargetOptions } from '../target';

export default class Rust extends Target {
  protected readonly generator: RustGenerator;

  public constructor(options: TargetOptions) {
    super(options);
    this.generator = new RustGenerator();
  }

  // TODO: Remove eslint-disable once we have a working generator
  // eslint-disable-next-line @typescript-eslint/require-await
  public async build(_sourceDir: string, _outDir: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

// TODO: Do we need to add async?? Will it be a lint err??

class RustGenerator implements IGenerator {
  public generate(_fingerprint: boolean): void {
    throw new Error('Method not implemented.');
  }

  // TODO: Remove eslint-disable once we have a working generator
  // eslint-disable-next-line @typescript-eslint/require-await
  public async load(_packageDir: string, _assembly: Assembly): Promise<void> {
    throw new Error('Method not implemented.');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async upToDate(_outDir: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // TODO: Possibly destructure legalese
  // eslint-disable-next-line @typescript-eslint/require-await
  public async save(
    _outdir: string,
    _tarball: string,
    _legalese: Legalese,
  ): Promise<any> {
    throw new Error('Method not implemented.');
  }
}
