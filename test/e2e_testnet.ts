import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "./helpers";
import { SingleNominatorContract } from "../contracts/single-nominator-contract";
import { SingleNominatorSource } from "../contracts/single-nominator-source";

import { Address, CellMessage, CommonMessageInfo, InternalMessage, TonClient, WalletContract, toNano, StateInit, beginCell, fromNano, Cell } from "ton";

import { waitForSeqno } from "./helpers";
import { expect } from "chai";
import {compileFuncToB64} from "../src/utils";

const elector = Address.parse("Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF");
const config = Address.parse("Ef9VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVbxn");

const client = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: "0b9c288987a40a10ac53c277fe276fd350d217d0a97858a093c796a5b09f39f6"});
// const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://sandbox.tonhubapi.com/jsonRPC"});
const BLOCK_TIME = 10000;
const FIREWALL_MIN_TON = 2;
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

  const source = SingleNominatorSource.create({owner, validator});
  const contract = await SingleNominatorContract.create(source);

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
  toAddr: Address,
  amount = FIREWALL_MIN_TON * 2
) {

  const seqno = await walletContract.getSeqNo();
  const transfer = await walletContract.createTransfer({
    secretKey: privateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    order: new InternalMessage({
      to: toAddr,
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

	console.log(owner.address)

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

    balance = parseFloat(fromNano((await client.getBalance(validator.address)).toNumber()));
    if (balance < FIREWALL_MIN_TON) {
      console.log(`Validator contract balance is too small (${balance}), sending coins to ${validator.address.toFriendly()}`);
      await transferFunds(client, deployWallet, deployWalletKey.secretKey, validator.address);
    }

	firewallContract = await deployFirewall(client, deployWallet, owner.address, validator.address, deployWalletKey.secretKey);
    console.log(`firewall contract address: ${firewallContract.address.toFriendly()}`);

  });

  it("send WITHDRAW from owner", async () => {
    balance = 2;
    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, WITHDRAW, balance, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(0.5, 0.25);
  });

  it("send WITHDRAW from owner", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 0.5;
    res = await sendTxToFirewall(client, owner, deployWalletKey.secretKey, firewallContract, true, false, WITHDRAW, balance, 0);
    expect(res).to.eq(true);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(0.5, 0.25);
  });

  it.only("send coins to my address", async () => {
  	let myAddr = Address.parse('EQBd31Rl7zrpOjGuTA7PEwmuFPFvacTF8o1HDdcQDG30huZL');

    balance = parseFloat(fromNano((await client.getBalance(deployWallet.address)).toNumber()));
    console.log(`transferring ${balance -0.5} TON from deploy wallet at ${deployWallet.address.toFriendly()} to ${myAddr.toFriendly()}`);
    await transferFunds(client, deployWallet, deployWalletKey.secretKey, myAddr, balance - 0.5);
  });

  it("send NEW_STAKE, balance is expected to return (due to cell underflow on elector)", async () => {
    balance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber())) - 1.5;
    res = await sendTxToFirewall(client, validator, validatorWalletKey.secretKey, firewallContract, true, false, NEW_STAKE, balance);
    await sleep(BLOCK_TIME);
    newBalance = parseFloat(fromNano((await client.getBalance(firewallContract.address)).toNumber()));
    expect(newBalance).closeTo(balance + 1.5, 1);
    expect(res).to.eq(true);
  });


});


function bytesToAddress(bufferB64: string) {
    const buff = Buffer.from(bufferB64, "base64");
    let c2 = Cell.fromBoc(buff);
    return c2[0].beginParse().readAddress() as Address;
}
