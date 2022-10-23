import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "./helpers";
import { SingleNominatorContract } from "../contract-ts/single-nominator-contract";

import { Address, CellMessage, CommonMessageInfo, InternalMessage, TonClient, WalletContract, toNano, StateInit, beginCell, fromNano, Cell } from "ton";

import {waitForSeqno, compileFuncToB64} from "./helpers";
import { expect } from "chai";
import {Buffer} from "buffer";

const elector = Address.parse("Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF");
const config = Address.parse("Ef9VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVbxn");

const client = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: "0b9c288987a40a10ac53c277fe276fd350d217d0a97858a093c796a5b09f39f6"});
// const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://sandbox.tonhubapi.com/jsonRPC"});
const BLOCK_TIME = 10000;
const FIREWALL_MIN_TON = 3;
const DEPLOYER_MIN_TON = 6;
const VALIDATOR_INDEX = 0;

const NEW_STAKE = 0x4e73744b;
const RECOVER_STAKE = 0x47657424;

const SEND_RAW_MSG = 0x1000;
const UPGRADE = 0x1001;
const AFTER_UPGRADE = 0x1002;
const CHANGE_VALIDATOR_ADDRESS = 0x1003;
const WITHDRAW = 0x1004;


function buildMessage(op: number | null, query_id: number, eitherBit = false, amount = 0) {
  if (op == null) return beginCell().endCell();

  let cell = beginCell().storeUint(op, 32).storeUint(query_id, 64).storeCoins(toNano(amount.toFixed(2)));
  if (eitherBit) {
    cell.storeUint(1, 800);
  }

  return cell.endCell();
}


async function deployFirewall(
  client: TonClient,
  walletContract: WalletContract,
  owner: Address,
  validator: Address,
  privateKey: Buffer
) {

  const contract = await SingleNominatorContract.create({owner, validator});

  if (await client.isContractDeployed(contract.address)) {
    console.log(`contract: ${contract.address.toFriendly()} already Deployed`);
    return contract;
  }

  const seqno = await walletContract.getSeqNo();
  const transfer = await walletContract.createTransfer({
    secretKey: privateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    order: new InternalMessage({
      to: contract.address,
      value: toNano(FIREWALL_MIN_TON * 2),
      bounce: false,
      body: new CommonMessageInfo({
        stateInit: new StateInit({ data: contract.source.initialData, code: contract.source.initialCode }),
        body: null,
      }),
    }),
  });

  await client.sendExternalMessage(walletContract, transfer);
  await waitForContractToBeDeployed(client, contract.address);
  console.log(`- Deploy transaction sent successfully to -> ${contract.address.toFriendly()} [seqno:${seqno}]`);
  await sleep(BLOCK_TIME);
  return contract;
}

async function transferFunds(
  client: TonClient,
  walletContract: WalletContract,
  privateKey: Buffer,
  contract: SingleNominatorContract | WalletContract,
  amount = FIREWALL_MIN_TON * 2
) {

  const seqno = await walletContract.getSeqNo();
  const transfer = await walletContract.createTransfer({
    secretKey: privateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    order: new InternalMessage({
      to: contract.address,
      value: toNano(amount),
      bounce: false,
      body: new CommonMessageInfo(),
    }),
  });

  await client.sendExternalMessage(walletContract, transfer);
  await waitForSeqno(walletContract, seqno);
}

async function sendTxToFirewall(
  client: TonClient,
  walletContract: WalletContract,
  walletPrivateKey: Buffer,
  firewallContract: SingleNominatorContract,
  bounce: boolean,
  either: boolean = false,
  opcode: number | null = -1,
  value: number = 0,
  mode = 0,
  query_id: number = 1,
  payload: any = null
) {
  let seqno = await walletContract.getSeqNo();
  console.log(`send message to firewall with payload: ${buildMessage(opcode, query_id, either, value).toString()}`);

  const transfer = await walletContract.createTransfer({
    secretKey: walletPrivateKey,
    seqno: seqno,
    sendMode: mode,
    order: new InternalMessage({
      to: firewallContract.address,
      value: toNano(.5),
      bounce,
      body: new CommonMessageInfo({
        body: new CellMessage(payload ? payload: buildMessage(opcode, query_id, either, value)),
      }),
    }),
  });

  try {
    await client.sendExternalMessage(walletContract, transfer);
  } catch (e) {
    return false;
  }

  console.log(`- transaction sent successfully to firewall at -> ${firewallContract.address.toFriendly()} [wallet seqno:${seqno}]`);
  await sleep(BLOCK_TIME);
  return true;
}

describe("e2e test suite", () => {
  let balance: number;
  let ownerBalance: number;
  let newOwnerBalance: number;
  let newBalance: number;
  let res: any;
  let firewallContract: SingleNominatorContract;
  let deployWallet: WalletContract;
  let owner: WalletContract;
  let validator: WalletContract;
  let otherWalletContract: WalletContract;
  let deployWalletKey: any;
  let validatorWalletKey: any;
  let otherWalletKey: any;
  let lastTxs: any;
  let payload;
  let expected_owner;

  before(async () => {
    deployWalletKey = await initDeployKey("");
    res = await initWallet(client, deployWalletKey.publicKey);
    owner = deployWallet = res.wallet;

    console.log(`deployer contract address: ${deployWallet.address.toFriendly()}`);
    console.log(`https://tonsandbox.com/explorer/address/${deployWallet.address.toFriendly()}`);

    balance = parseFloat(fromNano((await client.getBalance(deployWallet.address)).toNumber()));
    if (balance < DEPLOYER_MIN_TON) {
      throw `Deploy wallet balance is too small (${balance}), please send at least ${DEPLOYER_MIN_TON} coins to ${deployWallet.address.toFriendly()}`;
    }

    validatorWalletKey = await initDeployKey(VALIDATOR_INDEX.toString());
    res = await initWallet(client, validatorWalletKey.publicKey, -1);
    validator = res.wallet;
    console.log(`validator contract address: ${validator.address.toFriendly()}`);
    console.log(`https://tonsandbox.com/explorer/address/${validator.address.toFriendly()}`);

	console.log(validatorWalletKey.secretKey.toString('base64'))
	console.log(validatorWalletKey.secretKey.length)
    process.exit()

	// ------------
	// let owner1 = Address.parse("EQBd31Rl7zrpOjGuTA7PEwmuFPFvacTF8o1HDdcQDG30huZL");
	// let validator1 = Address.parse("Ef-fsOaJyJuwhCj4x9Qr7HxIxBcnfgYTqjrvUkBxIaYUTufg");

	firewallContract = await deployFirewall(client, deployWallet, owner.address, validator.address, deployWalletKey.secretKey);
    console.log(`firewall contract address: ${firewallContract.address.toFriendly()}`);
    process.exit()
	// ------------

    otherWalletKey = await initDeployKey("-1");
    res = await initWallet(client, otherWalletKey.publicKey, -1);
    otherWalletContract = res.wallet;
    console.log(`other wallet contract address: ${otherWalletContract.address.toFriendly()}`);
    console.log(`https://tonsandbox.com/explorer/address/${otherWalletContract.address.toFriendly()}`);

    firewallContract = await deployFirewall(client, deployWallet, owner.address, validator.address, deployWalletKey.secretKey);
    console.log(`firewall contract address: ${firewallContract.address.toFriendly()}`);
    console.log(`https://tonsandbox.com/explorer/address/${firewallContract.address.toFriendly()}`);

    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    if (balance < FIREWALL_MIN_TON) {
      console.log(`Firewall contract balance is too small (${balance}), sending coins to ${firewallContract.address.toFriendly()}`);
      await transferFunds(client, deployWallet, deployWalletKey.secretKey, firewallContract);
    }

    balance = parseFloat(fromNano((await client.getBalance(validator.address)).toNumber()));
    if (balance < FIREWALL_MIN_TON) {
      console.log(`Validator contract balance is too small (${balance}), sending coins to ${validator.address.toFriendly()}`);
      await transferFunds(client, deployWallet, deployWalletKey.secretKey, validator);
    }

    balance = parseFloat(fromNano((await client.getBalance(otherWalletContract.address)).toNumber()));
    if (balance < FIREWALL_MIN_TON) {
      console.log(`Other wallet contract balance is too small (${balance}), sending coins to ${otherWalletContract.address.toFriendly()}`);
      await transferFunds(client, deployWallet, deployWalletKey.secretKey, otherWalletContract);
    }

  });

  it("send NEW_STAKE, balance is expected to return (due to cell underflow on elector)", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 1.5;
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, NEW_STAKE, balance);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(balance + 1.5, 1);
    expect(res).to.eq(true);
  });

  it("send NEW_STAKE with query_id = 0 should fail (WRONG_QUERY_ID on firewall)", async () => {
  	lastTxs = await client.getTransactions(firewallContract.address, {limit: 5});
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 1.5;
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, NEW_STAKE, balance, 0, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance > balance).to.eq(true);
  	res = await client.getTransactions(firewallContract.address, {limit: 5});
    expect(res[1].createdLt).to.eq(lastTxs[0].createdLt);
  });

  it("send RECOVER_STAKE", async () => {
  	lastTxs = await client.getTransactions(firewallContract.address, {limit: 5});
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, RECOVER_STAKE, 0, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance > balance).to.eq(true);
  	res = await client.getTransactions(firewallContract.address, {limit: 5});
    expect(res[2].inMessage.createdLt == lastTxs[0].inMessage.createdLt).to.eq(true);
    expect(res[0].outMessages.length).to.eq(0);
    expect(res[1].outMessages.length).to.eq(1);
  });

  it("send wrong opcode", async () => {
  	lastTxs = await client.getTransactions(firewallContract.address, {limit: 5});
    await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, 0xBEEF, 0, 0);
    await sleep(BLOCK_TIME);
  	res = await client.getTransactions(firewallContract.address, {limit: 5});
    expect(res[1].createdLt).to.eq(lastTxs[0].createdLt);
    // TODO: improve expect
  });

  it("send WITHDRAW from owner", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 0.5;
    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, WITHDRAW, balance, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(0.5, 0.25);
  });

  it("send coins to firewall", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    await transferFunds(client, deployWallet, deployWalletKey.secretKey, firewallContract, FIREWALL_MIN_TON * 2);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).to.closeTo(balance + FIREWALL_MIN_TON * 2, 0.5);
  });

  it("send WITHDRAW from validator should fail", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 0.5;
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, WITHDRAW, balance, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(balance + 0.5, 0.75);
  });

  it("send WITHDRAW from other account should fail", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 0.5;
    res = await sendTxToFirewall(client, otherWalletContract, otherWalletKey.secretKey, firewallContract, true, false, WITHDRAW, balance, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(balance + 0.5, 0.75);
  });

  it("change validator from owner", async () => {
	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    let validator_addr_before_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_before_change.toFriendly()).to.eq(validator.address.toFriendly());

  	payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32)
  	.storeUint(1, 64).storeAddress(otherWalletContract.address).endCell();
    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, CHANGE_VALIDATOR_ADDRESS, balance, 0, 1, payload);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    let validator_addr_after_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_after_change.toFriendly()).to.eq(otherWalletContract.address.toFriendly());

  	payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32)
  	.storeUint(1, 64).storeAddress(validator.address).endCell();
    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, CHANGE_VALIDATOR_ADDRESS, balance, 0, 1, payload);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    let new_validator_addr = bytesToAddress(res.stack[1][1].bytes);
    expect(new_validator_addr.toFriendly()).to.eq(validator.address.toFriendly());
  });

  it("change validator from validator should fail", async () => {
	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    let validator_addr_before_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_before_change.toFriendly()).to.eq(validator.address.toFriendly());

  	payload = beginCell().storeUint(CHANGE_VALIDATOR_ADDRESS, 32)
  	.storeUint(1, 64).storeAddress(otherWalletContract.address).endCell();
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, CHANGE_VALIDATOR_ADDRESS, balance, 0, 1, payload);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    let validator_addr_after_change = bytesToAddress(res.stack[1][1].bytes);
    expect(validator_addr_after_change.toFriendly()).to.eq(validator.address.toFriendly());
  });

  it("send NEW_STAKE with mode 128 using SEND_RAW_MSG from owner", async () => {

  	lastTxs = await client.getTransactions(firewallContract.address, {limit: 5});

    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));

	let mode = 128;
  	payload = beginCell().storeUint(SEND_RAW_MSG, 32).storeUint(1, 64)
  	.storeUint(mode, 8).storeRef(
		beginCell().storeUint(0x18, 6).storeAddress(elector).storeCoins(0)
		.storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
		.storeUint(NEW_STAKE, 32).storeUint(1, 64).endCell()
  	)
  	.endCell();

    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, SEND_RAW_MSG, balance, 0, 1, payload);
    await sleep(BLOCK_TIME);

  	res = await client.getTransactions(firewallContract.address, {limit: 5});

    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(balance, 1);
	expect(res[2].createdLt).to.eq(lastTxs[0].createdLt);
	expect(Number(fromNano(res[0].inMessage.value))).to.closeTo(balance, 1);
  });

  it("send WITHDRAW with mode 128 using SEND_RAW_MSG from owner", async () => {

	let mode = 128;
  	payload = beginCell().storeUint(SEND_RAW_MSG, 32).storeUint(1, 64)
  	.storeUint(mode, 8).storeRef(
		beginCell().storeUint(0x18, 6).storeAddress(owner.address).storeCoins(0)
		.storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
		.storeUint(0x101, 32).storeUint(1, 64).endCell()
  	)
  	.endCell();

    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, SEND_RAW_MSG, 0, 0, 1, payload);
    await sleep(BLOCK_TIME);

    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).eq(0);
  });

  it("send upgrade from owner", async () => {

	res = await client.callGetMethod(firewallContract.address, 'get_roles');
	expected_owner = bytesToAddress(res.stack[0][1].bytes);
    expect(expected_owner.toFriendly()).to.eq(owner.address.toFriendly());

    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));

	let codeB64: string = compileFuncToB64(["contracts/config.fc", "contracts/imports/stdlib.fc", "contracts/imports/nonstdlib.fc", "contracts/test.fc"]);
	let code = Cell.fromBoc(codeB64);

  	payload = beginCell().storeUint(UPGRADE, 32).storeUint(1, 64)
  	.storeRef(code[0]).endCell();

    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, SEND_RAW_MSG, balance, 0, 1, payload);
    await sleep(3 * BLOCK_TIME);

	res = await client.callGetMethod(firewallContract.address, 'magic');
    expect(res.stack[0][1]).to.eq('0xcafe');

	codeB64 = compileFuncToB64(["contracts/config.fc", "contracts/imports/stdlib.fc", "contracts/imports/nonstdlib.fc", "contracts/single-nominator.fc"]);
	code = Cell.fromBoc(codeB64);

  	payload = beginCell().storeUint(UPGRADE, 32).storeUint(1, 64)
  	.storeRef(code[0]).endCell();

    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, SEND_RAW_MSG, balance, 0, 1, payload);
    await sleep(3 * BLOCK_TIME);

	res = await client.callGetMethod(firewallContract.address, 'get_roles');
    expected_owner = bytesToAddress(res.stack[0][1].bytes);
    expect(expected_owner.toFriendly()).to.eq(owner.address.toFriendly());
  });

});


function bytesToAddress(bufferB64: string) {
    const buff = Buffer.from(bufferB64, "base64");
    let c2 = Cell.fromBoc(buff);
    return c2[0].beginParse().readAddress() as Address;
}
