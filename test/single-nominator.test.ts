import { KeyPair } from "@ton/crypto";
import { Address, beginCell, Cell, toNano } from "@ton/ton";
import { storeMessage } from "@ton/core";
import { internal } from "ton-contract-executor";
import { expect } from "chai";
import { initDeployKey, compileFuncToB64 } from "./helpers";
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
const WRONG_VALIDATOR_WC = 0x2003;
const INSUFFICIENT_BALANCE = 0x2004;
const INSUFFICIENT_ELECTOR_FEE = 0x2005;

describe("single nominator test suite", () => {
    let walletKeys: KeyPair;
    let nominator: SingleNominatorMock;

    let _defaultWalletKeys: KeyPair;
    let _defaultNominator: SingleNominatorMock;

    beforeEach(async () => {
        if (!_defaultWalletKeys) _defaultNominator = await SingleNominatorMock.Create(toNano(10000), owner, validator_masterchain);
        if (!_defaultWalletKeys) _defaultWalletKeys = await initDeployKey();
        walletKeys = _defaultWalletKeys;
        nominator = _defaultNominator;
    });

    it("send coins to contract (empty message)", async () => {
        const body = beginCell().endCell();
        let res = await nominator.sendInternalMessage(
            internal({
                src: owner,
                dest: nominator.address,
                value: toNano(1.234),
                bounce: true,
                body: body,
            })
        );

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
        expect(res.type).eq("success");
    });

    it("send elector NEW_STAKE opcode with missing params should fail (cell underflow)", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(1)) // coins
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(9);
        expect(res.type).eq("failed");
    });

    it("send elector NEW_STAKE opcode with 0.1 coins should fail", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(0.1),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(0.1)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(INSUFFICIENT_ELECTOR_FEE);
        expect(res.type).eq("failed");
    });

    it("send elector NEW_STAKE opcode with low nominator balance should fail", async () => {
        nominator = await SingleNominatorMock.Create(toNano(1), owner, validator_masterchain);
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(0.1)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(INSUFFICIENT_BALANCE);
        expect(res.type).eq("failed");
    });

    it("send elector RECOVER_STAKE without query_id should fail", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell().storeUint(RECOVER_STAKE, 32).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(9);
        expect(res.type).eq("failed");
    });

    it("send elector RECOVER_STAKE opcode", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell().storeUint(RECOVER_STAKE, 32).storeUint(1, 64).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
        expect(res.type).eq("success");
    });

    it("send elector NEW_STAKE opcode with validator on basechain should fail", async () => {
        let nominator = await SingleNominatorMock.Create(toNano(10), owner, validator_basechain, -1);

        const message = internal({
            src: validator_basechain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(10)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_VALIDATOR_WC);
        expect(res.type).eq("failed");
    });

    it("send elector NEW_STAKE opcode with nominator on basechain should fail", async () => {
        let nominator = await SingleNominatorMock.Create(toNano(10), owner, validator_masterchain, 0);

        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(10)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("failed");
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_NOMINATOR_WC);
    });

    it("send elector wrong opcode", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1.234),
            bounce: true,
            body: beginCell()
                .storeUint(0x50, 32) // opcode
                .storeUint(1, 64) // query_id
                .storeCoins(toNano(10)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("send elector query_id=0 should fail", async () => {
        const message = internal({
            src: validator_masterchain,
            dest: nominator.address,
            value: toNano(1),
            bounce: true,
            body: beginCell()
                .storeUint(NEW_STAKE, 32) // opcode
                .storeUint(0, 64) // query_id
                .storeCoins(toNano(10)) // coins
                .storeUint(0, 256) // validator_pubkey
                .storeUint(0, 32) // stake_at
                .storeUint(0, 32) // max_factor
                .storeUint(0, 256) // adnl_addr
                .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
                .endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("failed");
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(WRONG_QUERY_ID);
    });

    it("owner withdraws from nominator with opcode", async () => {
        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(WITHDRAW, 32).storeUint(1, 64).storeCoins(1).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it("owner withdraws from nominator with comment", async () => {
        let balance = toNano(100);
        let toSend = toNano(0.5);
        nominator.contract.setBalance(balance);

        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(0, 32).storeStringTail("w").endCell(),
        });

        let toWithdraw = balance - toNano(1); // min for storage

        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(1);
        const act = res.actionList[0];
        expect(act.type).eq("send_msg");
        if (act.type == "send_msg" && act.message.info.type == "internal") {
            expect(act.message.info.value.coins).eq(toWithdraw);
        } else {
            expect("fail").eq("wrong withdraw amount");
        }
        expect(res.exit_code).eq(0);
    });

    it("owner doesn't withdraw with wrong comment", async () => {
        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(0, 32).storeStringTail("x").endCell(),
        });
        let res = await nominator.sendInternalMessage(message);
        expect(res.type).eq("failed");
        expect(res.actionList.length).eq(0);
    });

    it("change validator address by owner", async () => {
        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(new_validator_masterchain).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("change validator with new address on basechain", async () => {
        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(validator_basechain).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(0);
        expect(res.exit_code).eq(0);
    });

    it("owner send raw message", async () => {
        const fwd_message = internal({
            src: nominator.address,
            dest: elector,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(NEW_STAKE, 32).storeUint(1, 64).endCell(),
        });

        let cell = beginCell();
        storeMessage(fwd_message)(cell);

        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(SEND_RAW_MSG, 32).storeUint(1, 64).storeUint(2, 8).storeRef(cell).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });

    it("upgrade code by owner", async () => {
        const nominatorCode: string = compileFuncToB64(["test/contracts/stdlib.fc", "test/contracts/test-config-param.fc", "test/contracts/test-upgrade.fc"]);
        let codeCell = Cell.fromBoc(Buffer.from(nominatorCode, "hex"))[0];

        const message = internal({
            src: owner,
            dest: nominator.address,
            value: toNano(0.5),
            bounce: true,
            body: beginCell().storeUint(UPGRADE, 32).storeUint(1, 64).storeRef(codeCell).endCell(),
        });
        let res = await nominator.sendInternalMessage(message);

        expect(res.type).eq("success");
        expect(res.actionList.length).eq(1);
        expect(res.exit_code).eq(0);
    });
});
