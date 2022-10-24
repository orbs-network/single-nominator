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

const WITHDRAW = 0x1000;
const CHANGE_VALIDATOR_ADDRESS = 0x1001;
const SEND_RAW_MSG = 0x7702;
const UPGRADE = 0x9903;

const WRONG_NOMINATOR_WC = 0x2000;
const WRONG_QUERY_ID = 0x2001;
const WRONG_SET_CODE = 0x2002;
const WRONG_VALIDIATOR_WC = 0x2003;
const INSUFFICIENT_BALANCE = 0x2004;
const INSUFFICIENT_ELECTOR_FEE = 0x2005;

describe("single nominator test suite", () => {
    let walletKeys: KeyPair;
    let nominator: SingleNominatorMock;

    beforeEach(async () => {
        walletKeys = await initDeployKey();
        nominator = await SingleNominatorMock.Create(toNano(10000), owner, validator_masterchain);
    });

    it("send coins to contract (empty message)", async () => {

        const body = beginCell().endCell();
        const message = new InternalMessage({
            from: owner,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(body)
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector NEW_STAKE opcode with missing params should fail (cell underflow)", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(1)) // coins
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('failed');
    });

    it("send elector NEW_STAKE opcode with 0.1 coins should fail", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(.1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(.1)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(INSUFFICIENT_ELECTOR_FEE);
        expect(res.type).eq('failed');
    });

    it("send elector NEW_STAKE opcode with low nominator balance should fail", async () => {

        nominator = await SingleNominatorMock.Create(toNano(1), owner, validator_masterchain);
        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(.1)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(INSUFFICIENT_BALANCE);
        expect(res.type).eq('failed');
    });

    it("send elector RECOVER_STAKE without query_id should fail", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(RECOVER_STAKE, 32).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('failed');
    });

    it("send elector RECOVER_STAKE opcode", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(RECOVER_STAKE, 32).storeUint(1, 64).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq('success');
    });

    it("send elector NEW_STAKE opcode with validator on basechain should fail", async () => {

        let nominator = await SingleNominatorMock.Create(toNano(10), owner, validator_basechain, -1);

        const message = new InternalMessage({
            from: validator_basechain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(10)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_VALIDIATOR_WC);
        expect(res.type).eq('failed');
    });

    it("send elector NEW_STAKE opcode with nominator on basechain should fail", async () => {

        let nominator = await SingleNominatorMock.Create(toNano(10), owner, validator_masterchain, 0);

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(10)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('failed');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_NOMINATOR_WC);
    });

 	it("send elector wrong opcode", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1.234),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(0x50, 32) // opcode
					.storeUint(1, 64) // query_id
					.storeCoins(toNano(10)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

 	it("send elector query_id=0 should fail", async () => {

        const message = new InternalMessage({
            from: validator_masterchain,
            to: nominator.address,
            value: toNano(1),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell()
					.storeUint(NEW_STAKE, 32) // opcode
					.storeUint(0, 64) // query_id
					.storeCoins(toNano(10)) // coins
					.storeUint(0, 256) // validator_pubkey
					.storeUint(0, 32) // stake_at
					.storeUint(0, 32) // max_factor
					.storeUint(0, 256) // adnl_addr
					.storeRef(beginCell().storeUint(0, 256).endCell()) // signature
					.endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('failed');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_QUERY_ID);
    });

    it("owner withdraws from nominator", async () => {

		const message = new InternalMessage({
            from: owner,
            to: nominator.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(WITHDRAW, 32).storeUint(1, 64).storeCoins(1).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it("change validator address by owner", async () => {

		const message = new InternalMessage({
            from: owner,
            to: nominator.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(new_validator_masterchain).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("change validator with new address on basechain", async () => {

		const message = new InternalMessage({
            from: owner,
            to: nominator.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(validator_basechain).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("owner send raw message", async () => {

		const fwd_message = new InternalMessage({
            from: nominator.address,
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
            to: nominator.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(SEND_RAW_MSG, 32).storeUint(1, 64).storeUint(2, 8).storeRef(cell).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it("upgrade code by owner", async () => {

        const nominatorCode: string = compileFuncToB64(["test/contracts/stdlib.fc", "test/contracts/test-config-param.fc", "test/contracts/test-upgrade.fc"]);
		let codeCell = Cell.fromBoc(nominatorCode);

		const message = new InternalMessage({
            from: owner,
            to: nominator.address,
            value: toNano(0.5),
            bounce:true,
            body: new CommonMessageInfo({
                body: new CellMessage(beginCell().storeUint(UPGRADE, 32).storeUint(1, 64).storeRef(codeCell[0]).endCell())
            })
        })
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq('success');
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

});
