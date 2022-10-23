import {KeyPair} from "ton-crypto";
import {Address, beginCell, Cell, CellMessage, CommonMessageInfo, createWalletTransferV3, ExternalMessage, InternalMessage, toNano} from "ton";
import {expect} from "chai";
import {initDeployKey, compileFuncToB64} from "./helpers";
import { SingleNominatorMock } from "../contracts-ts/single-nominator-mock";

const elector = Address.parse("Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF");
const config = Address.parse("Ef9VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVbxn");
const owner = Address.parse("EQCLjyIQ9bF5t9h3oczEX3hPVK4tpW2Dqby0eHOH1y5_Nvb7");
const validator_basechain = Address.parse("EQDrjaLahLkMB-hMCmkzOyBuHJ139ZUYmPHu6RRBKnbdLIYI");
const validator_masterchain = Address.parse("Ef8ZvWFCk64ubdT7k9fADlAADZW2oUeE0F__hNAx5vmQ27Ls");
const new_validator_masterchain = Address.parse("Ef89RBOf9PQfgYWux_etNzUNWjK_d7wXxkeFyVNvof46VrQn");

const NEW_STAKE = 0x4e73744b;
const RECOVER_STAKE = 0x47657424;

const SEND_RAW_MSG = 0x1000;
const UPGRADE = 0x1001;
const CHANGE_VALIDATOR_ADDRESS = 0x1003;
const WITHDRAW = 0x1004;

const WRONG_FIREWALL_WC = 0x2001;
const WRONG_OP = 0x2002;
const WRONG_QUERY_ID = 0x2003;

describe("firewall test suite", () => {
    let walletKeys: KeyPair;
    let fireWall: SingleNominatorMock;

    beforeEach(async () => {
        walletKeys = await initDeployKey();
        fireWall = await SingleNominatorMock.Create(toNano(10000), owner, validator_masterchain);
    });

    it("send coins to contract ( empty message)", async () => {

        const body = beginCell().endCell();
        const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(body)
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector NEW_STAKE opcode", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(NEW_STAKE, 32).storeUint(1, 64).storeCoins(toNano(1)).storeUint(1, 8).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector RECOVER_STAKE opcode", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(RECOVER_STAKE, 32).storeUint(1, 64).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector NEW_STAKE opcode with validator on basechain should pass", async () => {

        let fireWall = await SingleNominatorMock.Create(toNano(10), owner, validator_basechain, -1);

        const message = new InternalMessage({
            from: validator_basechain,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(NEW_STAKE, 32).storeUint(1, 64).storeCoins(toNano(1)).storeUint(1, 8).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector NEW_STAKE opcode with firewall on basechain should fail", async () => {

        let fireWall = await SingleNominatorMock.Create(toNano(10), owner, validator_masterchain, 0);

        const message = new InternalMessage({
            from: validator_masterchain,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(NEW_STAKE, 32).storeUint(1, 64).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('failed');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_FIREWALL_WC);
    });

 	it("send elector wrong opcode", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: fireWall.address,
            value: toNano(1.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(0x50, 32).storeUint(1, 64).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('failed');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_OP);
    });

 	it("send elector wrong query_id", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: fireWall.address,
            value: toNano(1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(NEW_STAKE, 32).storeUint(0, 64).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('failed');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_QUERY_ID);
    });

    it("owner withdraws from firewall", async () => {

		const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(WITHDRAW, 32).storeUint(1, 64).storeCoins(1).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it("change validator address by owner", async () => {

		const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(new_validator_masterchain).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("change validator with new address on basechain", async () => {

		const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(validator_basechain).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("owner send raw message", async () => {

		const fwd_message = new InternalMessage({
            from: owner,
            to: elector,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(NEW_STAKE, 32).storeUint(1, 64).endCell())
            })
        })

		let cell = new Cell();
		fwd_message.writeTo(cell);

		const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(SEND_RAW_MSG, 32).storeUint(1, 64).storeUint(2, 8).storeRef(cell).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it.only("upgrade code by owner", async () => {

		const firewallCodeB64: string = compileFuncToB64(["contracts/imports/stdlib.fc", "contracts/single-nominator.fc"]);
		let codeCell = Cell.fromBoc(firewallCodeB64);

		const message = new InternalMessage({
            from: owner,
            to: fireWall.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(UPGRADE, 32).storeUint(1, 64).storeRef(codeCell[0]).endCell())
            })
        })
        let res = await fireWall.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(2);
        expect(res.exit_code).eq(0);
    });

});
