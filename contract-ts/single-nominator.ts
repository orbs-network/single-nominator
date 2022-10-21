import BN from "bn.js";
import { Address, beginCell, Cell, contractAddress, InternalMessage, toNano } from "ton";
import { SmartContract } from "ton-contract-executor";
import { compileFuncToB64 } from "./utils";


export class SingleNominator {
    contract: SmartContract;
    address: Address;

    private constructor(contract: SmartContract, myAddress: Address, balance: BN) {
        this.contract = contract;
        this.address = myAddress;
        contract.setC7Config({
            balance: balance.toNumber(),
            myself: myAddress,
        });
    }

    async sendInternalMessage(message: InternalMessage) {
        return this.contract.sendInternalMessage(message);
    }

    static getCode(isUnitTest: boolean): Cell[] {
        const jettonWalletCodeB64: string = compileFuncToB64([isUnitTest ? "test/contracts/test-config.fc" : "contracts/config.fc", "contracts/imports/stdlib.fc", "contracts/imports/nonstdlib.fc", "contracts/single-nominator.fc"]);
        return Cell.fromBoc(jettonWalletCodeB64);
    }

    static async Create(balance = toNano(10), owner: Address, validator: Address, firewall_wc = -1, isUnitTest = true) {
        const codeCell = SingleNominator.getCode(isUnitTest)[0];
        const dataCell = beginCell().storeAddress(owner).storeAddress(validator).endCell();
        const contract = await SmartContract.fromCell(codeCell, dataCell, {
            getMethodsMutate: true,
            debug: true,
        });
        const myAddress = contractAddress({ workchain: firewall_wc, initialCode: codeCell, initialData: dataCell });
        return new SingleNominator(contract, myAddress, balance);
    }
}
