import { Address, Cell, Contract, contractAddress, Message, StateInit, beginCell } from "@ton/core";
import { compileFuncToB64 } from "../test/helpers";

export type Maybe<T> = T | null | undefined;

export class SingleNominator implements Contract {
    readonly address: Address;
    readonly init_: StateInit;

    constructor(initialCode: Cell, initialData: Cell, workchain = -1) {
        this.init_ = { code: initialCode, data: initialData } as StateInit;
        this.address = contractAddress(workchain, this.init_);
    }

    static create(opts: { owner: Address; validator: Address }) {
        // Build initial code and data
        let initialCode = this.getCode()[0];
        let initialData = beginCell().storeAddress(opts.owner).storeAddress(opts.validator).endCell();

        return new SingleNominator(initialCode, initialData, -1);
    }

    static getCode(): Cell[] {
        const nominatorCode: string = compileFuncToB64(["contracts/imports/stdlib.fc", "contracts/single-nominator.fc"]);
        return Cell.fromBoc(Buffer.from(nominatorCode, "hex"));
    }
}
