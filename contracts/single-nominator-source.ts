import { Address, Cell, ConfigStore, ContractSource } from "ton";
import { Maybe } from "ton/dist/types";
import { SingleNominator } from "../src/single-nominator";

export class SingleNominatorSource implements ContractSource {
  static create(opts: { owner: Address; validator: Address }) {
    // Build initial code and data
    let initialCode = SingleNominator.getCode(false)[0];
    let initialData = new Cell();
    initialData.bits.writeAddress(opts.owner);
    initialData.bits.writeAddress(opts.validator);

    return new SingleNominatorSource({ initialCode, initialData, workchain: -1});
  }

  readonly initialCode: Cell;
  readonly initialData: Cell;
  readonly workchain: number;
  readonly type = "firewall";

  private constructor(args: { initialCode: Cell; initialData: Cell; workchain: number;}) {
    this.initialCode = args.initialCode;
    this.initialData = args.initialData;
    this.workchain = args.workchain;
  }

  describe() {
    return "SingleNominator source";
  }

  backup() {
    const config = new ConfigStore();
    config.setInt("wc", this.workchain);
    return config.save();
  }
}
