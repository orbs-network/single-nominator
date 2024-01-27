import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "./helpers";
import { SingleNominator } from "../contracts-ts/single-nominator";
import { Address, TonClient, toNano, beginCell, fromNano, Cell, WalletContractV3R2, OpenedContract, internal } from "@ton/ton";
import { parseTransaction } from "ton";
import { Cell as CellOld } from "ton";

import { waitForSeqno, compileFuncToB64 } from "./helpers";
import { expect } from "chai";
import { Buffer } from "buffer";

const elector = Address.parse("Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF");

console.log("-==== process.env ====----", {
  endpoint: process.env.TON_ENDPOINT,
  apiKey: process.env.TON_API_KEY,
});

export const client = new TonClient({
  endpoint: process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC",
  apiKey: "f20ff0043ded8c132d0b4b870e678b4bbab3940788cbb8c8762491935cf3a460",
});
const BLOCK_TIME = 10000;
const NOMINATOR_MIN_TON = 3;
const DEPLOYER_MIN_TON = 6;
const VALIDATOR_INDEX = 0;

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

const CELL_UNDERFLOW = 9;

const STAKE_AMOUNT = 1.2345;
const SEND_MSG_VALUE = 1.3;

const MIN_TON_FOR_STORAGE = 1;

function buildMessage(op: number | null, query_id: number, eitherBit = false, amount = 0) {
  if (op == null) return beginCell().endCell();

  let cell = beginCell()
    .storeUint(op, 32)
    .storeUint(query_id, 64)
    .storeCoins(toNano(amount.toFixed(2)))
    .storeUint(0, 256) // validator_pubkey
    .storeUint(0, 32) // stake_at
    .storeUint(0, 32) // max_factor
    .storeUint(0, 256); // adnl_addr

  if (eitherBit) {
    cell.storeRef(beginCell().storeUint(0, 256).endCell()); // signature
  }

  return cell.endCell();
}

function newStakeMsg(query_id: number) {
  return beginCell()
    .storeUint(NEW_STAKE, 32)
    .storeUint(query_id, 64)
    .storeCoins(toNano(STAKE_AMOUNT.toFixed(2)))
    .storeUint(0, 256) // validator_pubkey
    .storeUint(0, 32) // stake_at
    .storeUint(0, 32) // max_factor
    .storeUint(0, 256) // adnl_addr
    .storeRef(beginCell().storeUint(0, 256).endCell()) // signature
    .endCell();
}

function partialNewStakeMsg(query_id: number) {
  return beginCell()
    .storeUint(NEW_STAKE, 32)
    .storeUint(query_id, 64)
    .storeCoins(toNano(STAKE_AMOUNT.toFixed(2)))
    .storeUint(0, 256) // validator_pubkey
    .storeUint(0, 32) // stake_at
    .storeUint(0, 32) // max_factor
    .storeUint(0, 256) // adnl_addr
    .endCell();
}

function recoverStakeMsg(query_id: number) {
  return beginCell().storeUint(RECOVER_STAKE, 32).storeUint(query_id, 64).endCell();
}

function parseTxDetails(data: any) {
  const currentContract = data["inMessage"]["destination"];
  let boc = CellOld.fromBoc(Buffer.from(data.data, "base64"));
  const wc = Address.parse(currentContract.toString()).workChain;
  return parseTransaction(wc, boc[0].beginParse());
}

async function deployNominator(walletContract: OpenedContract<WalletContractV3R2>, owner: Address, validator: Address, privateKey: Buffer) {
  const contract = SingleNominator.create({ owner, validator });

  if (await client.isContractDeployed(contract.address)) {
    console.log(`deployNominator : contract: ${contract.address.toString()} already Deployed`);
    return contract;
  }

  const seqno = await walletContract.getSeqno();
  const transfer = walletContract.createTransfer({
    secretKey: privateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    messages: [
      internal({
        to: contract.address,
        value: toNano(0.3),
        bounce: false,
        init: { data: contract.init_.data, code: contract.init_.code },
        body: null,
      }),
    ],
  });

  await client.sendExternalMessage(walletContract, transfer);
  await waitForContractToBeDeployed(client, contract.address);
  console.log(`- Deploy transaction sent successfully to -> ${contract.address.toString()} [seqno:${seqno}]`);
  await sleep(BLOCK_TIME);
  return contract;
}

async function transferFunds(
  walletContract: OpenedContract<WalletContractV3R2>,
  privateKey: Buffer,
  contract: OpenedContract<SingleNominator | WalletContractV3R2>,
  amount = NOMINATOR_MIN_TON * 2
) {
  const seqno = await walletContract.getSeqno();
  const transfer = walletContract.createTransfer({
    secretKey: privateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    messages: [
      internal({
        to: contract.address,
        value: toNano(amount),
        bounce: false,
      }),
    ],
  });

  await client.sendExternalMessage(walletContract, transfer);
  await waitForSeqno(walletContract, seqno);
}

async function sendTxToNominator(validatorWallet: OpenedContract<WalletContractV3R2>, validatorPrivateKey: Buffer, nominatorAddress: Address, msg_value: number, payload: Cell) {
  let seqno = await validatorWallet.getSeqno();
  console.log(
    `send message to nominator with payload: ${payload.toString()}, validatorWallet: ${validatorWallet.address.toString()} , nominatorAddress = ${nominatorAddress.toString()}`
  );

  const transfer = validatorWallet.createTransfer({
    secretKey: validatorPrivateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    messages: [
      internal({
        to: nominatorAddress,
        value: toNano(msg_value),
        bounce: true,
        body: payload,
      }),
    ],
  });

  try {
    await client.sendExternalMessage(validatorWallet, transfer);
  } catch (e) {
    console.log(e);

    return false;
  }

  console.log(`- transaction sent successfully to nominator at -> ${nominatorAddress.toString()} [wallet seqno:${seqno}]`);
  await sleep(BLOCK_TIME);
  return true;
}

describe("e2e test suite", () => {
  let balance: number;
  let newBalance: number;
  let res: any;
  let nominatorContract: SingleNominator;
  let deployWallet: OpenedContract<WalletContractV3R2>;
  let owner: OpenedContract<WalletContractV3R2>;
  let validator: OpenedContract<WalletContractV3R2>;
  let otherWalletContract: OpenedContract<WalletContractV3R2>;
  let deployWalletKey: any;
  let validatorWalletKey: any;
  let otherWalletKey: any;
  let lastTxs: any;
  let payload: Cell;
  let expected_owner;

  before(async () => {
    deployWalletKey = await initDeployKey("");
    deployWallet = await initWallet(client, deployWalletKey.publicKey);
    owner = deployWallet;

    console.log(`deployer contract address: ${deployWallet.address.toString()}`);
    console.log(`https://testnet.tonapi.io/account/${deployWallet.address.toString()}`);

    balance = parseFloat(fromNano(await deployWallet.getBalance()));
    if (balance < DEPLOYER_MIN_TON) {
      throw `Deploy wallet balance is too small (${balance}), please send at least ${DEPLOYER_MIN_TON} coins to ${deployWallet.address.toString()}`;
    }

    validatorWalletKey = await initDeployKey(VALIDATOR_INDEX.toString());
    validator = await initWallet(client, validatorWalletKey.publicKey, -1);
    console.log(`validator contract address: ${validator.address.toString()}`);
    console.log(`https://testnet.tonapi.io/account/${validator.address.toString()}`);

    otherWalletKey = await initDeployKey("-1");
    otherWalletContract = await initWallet(client, otherWalletKey.publicKey, -1);
    console.log(`other wallet contract address: ${otherWalletContract.address.toString()}`);
    console.log(`https://testnet.tonapi.io/account/${otherWalletContract.address.toString()}`);

    nominatorContract = await deployNominator(deployWallet, owner.address, owner.address, deployWalletKey.secretKey);
    console.log(`nominator contract address: ${nominatorContract.address.toString()}`);
    console.log(`https://testnet.tonapi.io/account/${nominatorContract.address.toString()}`);

    balance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    if (balance < NOMINATOR_MIN_TON) {
      console.log(`Nominator contract balance is too small (${balance}), sending coins to ${nominatorContract.address.toString()}`);
      await transferFunds(deployWallet, deployWalletKey.secretKey, nominatorContract);
    }

    balance = parseFloat(fromNano(await validator.getBalance()));
    if (balance < NOMINATOR_MIN_TON) {
      console.log(`Validator contract balance is too small (${balance}), sending coins to ${validator.address.toString()}`);
      await transferFunds(deployWallet, deployWalletKey.secretKey, validator);
    }

    balance = parseFloat(fromNano(await otherWalletContract.getBalance()));
    if (balance < NOMINATOR_MIN_TON) {
      console.log(`Other wallet contract balance is too small (${balance}), sending coins to ${otherWalletContract.address.toString()}`);
      await transferFunds(deployWallet, deployWalletKey.secretKey, otherWalletContract);
    }
  });

  it("send NEW_STAKE with small msg_value should fail (INSUFFICIENT_ELECTOR_FEE)", async () => {
    payload = partialNewStakeMsg(1);
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, 0.1, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.description.computePhase.exitCode).to.eq(INSUFFICIENT_ELECTOR_FEE);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send NEW_STAKE with query_id=0 should fail (WRONG_QUERY_ID)", async () => {
    payload = partialNewStakeMsg(0);
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.description.computePhase.exitCode).to.eq(WRONG_QUERY_ID);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send NEW_STAKE with partial message should fail (cell underflow)", async () => {
    payload = partialNewStakeMsg(1);
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.description.computePhase.exitCode).to.eq(CELL_UNDERFLOW);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send NEW_STAKE with full message to elector, stake should be returned ", async () => {
    payload = newStakeMsg(1);
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.inMessage.info.src.toString()).to.eq(elector.toString());
    expect(Number(fromNano(res.inMessage.info.value.coins))).closeTo(STAKE_AMOUNT + SEND_MSG_VALUE, 0.3);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send RECOVER_STAKE from elector (no stake at elector only msg value should be returned)", async () => {
    payload = recoverStakeMsg(1);
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.inMessage.info.bounced).to.eq(false);
    expect(res.inMessage.info.src.toString()).to.eq(elector.toString());
    expect(Number(fromNano(res.inMessage.info.value.coins))).closeTo(SEND_MSG_VALUE, 0.2);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send RECOVER_STAKE with partial payload should fail (cell underflow)", async () => {
    payload = beginCell().storeUint(RECOVER_STAKE, 32).endCell();
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    console.log(res);
    expect(res.description.computePhase.exitCode).to.eq(CELL_UNDERFLOW);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send WITHDRAW from owner", async () => {
    balance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    payload = beginCell()
      .storeUint(WITHDRAW, 32)
      .storeUint(0, 64)
      .storeCoins(toNano(balance.toFixed(2)))
      .endCell();
    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    newBalance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    expect(newBalance).closeTo(MIN_TON_FOR_STORAGE, 0);
  });

  it("send coins to nominator", async () => {
    balance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    await transferFunds(deployWallet, deployWalletKey.secretKey, nominatorContract, NOMINATOR_MIN_TON * 2);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    expect(newBalance).to.closeTo(balance + NOMINATOR_MIN_TON * 2, 0.2);
  });

  it.only("send WITHDRAW from validator should fail", async () => {
    balance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    payload = beginCell()
      .storeUint(WITHDRAW, 32)
      .storeUint(0, 64)
      .storeCoins(toNano(balance.toFixed(2)))
      .endCell();
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    expect(newBalance).closeTo(balance + SEND_MSG_VALUE, 0.2);
  });

  it("send WITHDRAW from validator should deduct from fund not enough gas", async () => {
    const withdrawAmount = 0.5;
    payload = beginCell()
      .storeUint(WITHDRAW, 32)
      .storeUint(0, 64)
      .storeCoins(toNano(withdrawAmount.toFixed(2)))
      .endCell();
    const MINIMAL_GAS_MONEY = 0.05;
    let res = await sendTxToNominator(owner, deployWalletKey.secretKey, Address.parse("Ef__kzBtDfpgUz7gbKNo6MQYyaQ0kcaoEEMh9nO9VFln2LNQ"), MINIMAL_GAS_MONEY, payload);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    expect(newBalance).closeTo(balance + SEND_MSG_VALUE, 0.2);
  });

  it("Send pico tons to SN", async () => {
    let value = 0.000001;

    const MY_SN = Address.parse("Ef__kzBtDfpgUz7gbKNo6MQYyaQ0kcaoEEMh9nO9VFln2LNQ");
    let seqno = await owner.getSeqno();

    const transfer = owner.createTransfer({
      secretKey: deployWalletKey.secretKey,
      seqno: seqno,
      sendMode: 1 + 2,
      messages: [
        internal({
          to: MY_SN,
          value: toNano(value),
          bounce: true,
          body: null,
        }),
      ],
    });

    try {
      await client.sendExternalMessage(owner, transfer);
    } catch (e) {
      return false;
    }

    console.log(`- transaction sent successfully to nominator at -> ${MY_SN.toString()} [wallet seqno:${seqno}]`);
    await sleep(BLOCK_TIME);
  });

  it("print balance of SN", async () => {
    let withdrawAmount = await client.getBalance(nominatorContract.address);
    //withdrawAmount = withdrawAmount.sub(toNano(0.00005))

    console.log({ withdrawAmount: fromNano(withdrawAmount) });
    return;
  });

  it("withdraw all funds from SN using mode 128 and SEND-RAW-MESSAGE emergency API", async () => {
    let mode = 128;
    let queryId = 777717;
    let payload = beginCell()
      .storeUint(SEND_RAW_MSG, 32)
      .storeUint(queryId, 64)
      .storeUint(mode, 8)
      .storeRef(
        beginCell()
          .storeUint(0x18, 6)
          .storeAddress(owner.address)
          .storeCoins(toNano(0.1))
          .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
          .endCell()
      )
      .endCell();

    const MY_SN = Address.parse("Ef-BwKen4yPmPJpar8JK4dyygP4OzACy_1Emgg6KAW-4vEEc");

    res = await sendTxToNominator(owner, deployWalletKey.secretKey, MY_SN, 0.1, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(MY_SN, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.inMessage.info.src.toString()).to.eq(elector.toString());
    expect(Number(fromNano(res.inMessage.info.value.coins))).closeTo(STAKE_AMOUNT + SEND_MSG_VALUE, 0.3);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("withdraw all funds from SN", async () => {
    let balance = await client.getBalance(nominatorContract.address);
    console.log({ balance: fromNano(balance) });

    let state = await client.getContractState(nominatorContract.address);
    console.log(Cell.fromBoc(state.data as Buffer).toString());
    console.log(Cell.fromBoc(state.code as Buffer).toString());
  });

  it("change validator from owner", async () => {
    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    let validator_addr_before_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_before_change.toString()).to.eq(validator.address.toString());

    payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(otherWalletContract.address).endCell();
    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    let validator_addr_after_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_after_change.toString()).to.eq(otherWalletContract.address.toString());

    payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(validator.address).endCell();
    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);
    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    let new_validator_addr = bytesToAddress(res.stack[1][1].bytes);
    expect(new_validator_addr.toString()).to.eq(validator.address.toString());
  });

  it("change validator from validator should fail", async () => {
    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    let validator_addr_before_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_before_change.toString()).to.eq(validator.address.toString());

    payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32).storeUint(1, 64).storeAddress(otherWalletContract.address).endCell();
    res = await sendTxToNominator(validator, validatorWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);
    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    let validator_addr_after_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_after_change.toString()).to.eq(validator.address.toString());
  });

  it("send RECOVER_STAKE from owner using SEND_RAW_MSG, stake should be returned", async () => {
    let mode = 64;
    let queryId = 777717;
    let payload = beginCell()
      .storeUint(SEND_RAW_MSG, 32)
      .storeUint(queryId, 64)
      .storeUint(mode, 8)
      .storeRef(
        beginCell()
          .storeUint(0x18, 6)
          .storeAddress(elector)
          .storeCoins(toNano(1.1))
          .storeUint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
          .storeRef(beginCell().storeUint(RECOVER_STAKE, 32).storeUint(queryId, 64).endCell())
          .endCell()
      )
      .endCell();

    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, 0.1, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.inMessage.info.src.toString()).to.eq(elector.toString());
    expect(Number(fromNano(res.inMessage.info.value.coins))).closeTo(STAKE_AMOUNT + SEND_MSG_VALUE, 0.3);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send TON (manual withdraw) from owner using SEND_RAW_MSG", async () => {
    const WITHDRAW_AMOUNT = 1.212;
    let mode = 64;
    let queryId = 37717;
    let payload = beginCell()
      .storeUint(SEND_RAW_MSG, 32)
      .storeUint(queryId, 64)
      .storeUint(mode, 8)
      .storeRef(
        beginCell()
          .storeUint(0x18, 6)
          .storeAddress(owner.address)
          .storeCoins(toNano(WITHDRAW_AMOUNT))
          .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
          .endCell()
      )
      .endCell();

    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, 0.1, payload);
    await sleep(BLOCK_TIME);

    res = await client.getTransactions(nominatorContract.address, { limit: 1 });
    res = parseTxDetails(res[0]);
    expect(res.inMessage.info.src.toString()).to.eq(owner.address.toString());
    expect(Number(fromNano(res.inMessage.info.value.coins))).closeTo(STAKE_AMOUNT + SEND_MSG_VALUE, 0.3);
    expect(res.time).closeTo(Date.now() / 1000, 30);
  });

  it("send upgrade from owner", async () => {
    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    expected_owner = bytesToAddress(res.stack[0][1].bytes);
    expect(expected_owner.toString()).to.eq(owner.address.toString());

    balance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));

    let codeB64: string = compileFuncToB64(["contracts/imports/stdlib.fc", "test/contracts/test-upgrade.fc"]);
    let code = Cell.fromBoc(Buffer.from(codeB64, "hex"));

    payload = beginCell().storeUint(UPGRADE, 32).storeUint(1, 64).storeRef(code[0]).endCell();

    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.callGetMethod(nominatorContract.address, "magic");
    expect(res.stack[0][1]).to.eq("0xcafe");

    codeB64 = compileFuncToB64(["contracts/imports/stdlib.fc", "contracts/single-nominator.fc"]);
    code = Cell.fromBoc(Buffer.from(codeB64, "hex"));

    payload = beginCell().storeUint(UPGRADE, 32).storeUint(1, 64).storeRef(code[0]).endCell();

    res = await sendTxToNominator(owner, deployWalletKey.secretKey, nominatorContract.address, SEND_MSG_VALUE, payload);
    await sleep(BLOCK_TIME);

    res = await client.callGetMethod(nominatorContract.address, "get_roles");
    expected_owner = bytesToAddress(res.stack[0][1].bytes);
    expect(expected_owner.toString()).to.eq(owner.address.toString());

    newBalance = parseFloat(fromNano(await client.getBalance(nominatorContract.address)));
    expect(newBalance).closeTo(balance + 2 * SEND_MSG_VALUE, 0.35);
  });
});

function bytesToAddress(bufferB64: string) {
  const buff = Buffer.from(bufferB64, "base64");
  let c2 = Cell.fromBoc(buff);
  return c2[0].beginParse().loadAddress() as Address;
}
