import { Address, beginCell, Cell, contractAddress, toNano } from "@ton/ton";
import { Message, MessageRelaxed } from "@ton/core";
import { SmartContract } from "ton-contract-executor";
import { compileFuncToB64 } from "../test/helpers";

export class SingleNominatorMock {
    contract: SmartContract;
    address: Address;

    private constructor(contract: SmartContract, myAddress: Address, balance: bigint) {
        this.contract = contract;
        this.address = myAddress;
        contract.setC7Config({
            balance: balance,
            myself: myAddress,
        });
    }

    async sendInternalMessage(message: Message) {
        return this.contract.sendInternalMessage(message);
    }

    static getCode(): Cell {
        const nominatorCode: string = compileFuncToB64(["test/contracts/stdlib.fc", "test/contracts/test-config-param.fc", "contracts/single-nominator.fc"]);
        return Cell.fromBoc(Buffer.from(nominatorCode, "hex"))[0];
    }

    static async Create(balance = toNano(10), owner: Address, validator: Address, workchain = -1) {
        const codeCell = SingleNominatorMock.getCode();
        const dataCell = beginCell().storeAddress(owner).storeAddress(validator).endCell();
        const contract = await SmartContract.fromCell(codeCell, dataCell, {
            getMethodsMutate: true,
            debug: true,
        });
        const myAddress = contractAddress(workchain, { code: codeCell, data: dataCell });
        return new SingleNominatorMock(contract, myAddress, balance);
    }
}
