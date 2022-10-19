import BN from "bn.js";
import {
  Address,
  Cell,
  CellMessage,
  InternalMessage,
  CommonMessageInfo,
  WalletContract,
  SendMode,
  parseCurrencyCollection,
  parseMessage,
  RawCurrencyCollection,
  RawMessage,
  Slice,
} from "ton";
import { SmartContract } from "ton-contract-executor";
import Prando from "prando";
import { mnemonicNew, mnemonicToWalletKey } from "ton-crypto";
import { TonClient, WalletV3R2Source, fromNano } from "ton";
import fs from "fs";
export type SendMsgOutAction = { type: "send_msg"; message: RawMessage; mode: number };
export type ReserveCurrencyAction = { type: "reserve_currency"; mode: number; currency: RawCurrencyCollection };
export type UnknownOutAction = { type: "unknown" };
import { SingleNominatorContract } from "../contracts/single-nominator-contract";
import { SingleNominatorSource } from "../contracts/single-nominator-source";

export type OutAction = SendMsgOutAction | ReserveCurrencyAction | UnknownOutAction;

export const zeroAddress = new Address(0, Buffer.alloc(32, 0));

export async function randomWalletKey() {
  let deployerMnemonic = (await mnemonicNew(24)).join(" ");
  return mnemonicToWalletKey(deployerMnemonic.split(" "));
}

export function randomAddress(seed: string, workchain?: number) {
  const random = new Prando(seed);
  const hash = Buffer.alloc(32);
  for (let i = 0; i < hash.length; i++) {
    hash[i] = random.nextInt(0, 255);
  }
  return new Address(workchain ?? 0, hash);
}

// used with ton-contract-executor (unit tests) to sendInternalMessage easily
export function internalMessage(params: { from?: Address; to?: Address; value?: BN; bounce?: boolean; body?: Cell }) {
  const message = params.body ? new CellMessage(params.body) : undefined;
  return new InternalMessage({
    from: params.from ?? randomAddress("sender"),
    to: params.to ?? zeroAddress,
    value: params.value ?? 0,
    bounce: params.bounce ?? true,
    body: new CommonMessageInfo({ body: message }),
  });
}

// temp fix until ton-contract-executor (unit tests) remembers c7 value between calls
export function setBalance(contract: SmartContract, balance: BN) {
  contract.setC7Config({
    balance: balance.toNumber(),
  });
}

// helper for end-to-end on-chain tests (normally post deploy) to allow sending InternalMessages to contracts using a wallet
export async function sendInternalMessageWithWallet(params: { walletContract: WalletContract; secretKey: Buffer; to: Address; value: BN; bounce?: boolean; body?: Cell }) {
  const message = params.body ? new CellMessage(params.body) : undefined;
  const seqno = await params.walletContract.getSeqNo();
  const transfer = params.walletContract.createTransfer({
    secretKey: params.secretKey,
    seqno: seqno,
    sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
    order: new InternalMessage({
      to: params.to,
      value: params.value,
      bounce: params.bounce ?? false,
      body: new CommonMessageInfo({
        body: message,
      }),
    }),
  });
  await params.walletContract.client.sendExternalMessage(params.walletContract, transfer);
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(2000);
    const seqnoAfter = await params.walletContract.getSeqNo();
    if (seqnoAfter > seqno) return;
  }
}

export async function createWalletKey() {
  return await mnemonicToWalletKey(await mnemonicNew(24));
}

export function parseActionsList(actions: Slice | Cell): OutAction[] {
  let list: any[] = [];

  let ref: Slice;

  let outAction: OutAction;

  let slice;
  if (actions instanceof Cell) {
    slice = Slice.fromCell(actions);
  } else {
    slice = actions;
  }

  try {
    ref = slice.readRef();
  } catch (e) {
    return list;
  }

  let magic = slice.readUint(32).toNumber();
  if (magic === 0x0ec3c86d) {
    outAction = {
      type: "send_msg",
      mode: slice.readUint(8).toNumber(),
      message: parseMessage(slice.readRef()),
    };
  } else if (magic === 0x36e6b809) {
    outAction = {
      type: "reserve_currency",
      mode: slice.readUint(8).toNumber(),
      currency: parseCurrencyCollection(slice),
    };
  } else {
    outAction = { type: "unknown" };
  }

  list.push(outAction);
  list.push(...parseActionsList(ref));
  return list;
}

export async function waitForContractToBeDeployed(client: TonClient, deployedContract: Address) {
  const seqnoStepInterval = 2500;
  console.log(`⏳ waiting for contract to be deployed at [${deployedContract.toFriendly()}]`);
  for (var attempt = 0; attempt < 10; attempt++) {
    await sleep(seqnoStepInterval);
    if (await client.isContractDeployed(deployedContract)) {
      break;
    }
  }
  console.log(`⌛️ waited for contract deployment ${((attempt + 1) * seqnoStepInterval) / 1000}s`);
}

export async function waitForSeqno(walletContract: WalletContract, seqno: number) {
  const seqnoStepInterval = 3000;
  console.log(`⏳ waiting for seqno to update (${seqno})`);
  for (var attempt = 0; attempt < 10; attempt++) {
    await sleep(seqnoStepInterval);
    const seqnoAfter = await walletContract.getSeqNo();
    if (seqnoAfter > seqno) break;
  }
  console.log(`⌛️ seqno update after ${((attempt + 1) * seqnoStepInterval) / 1000}s`);
}

export function sleep(time: number) {
  return new Promise((resolve) => {
    console.log(`💤 ${time / 1000}s ...`);

    setTimeout(resolve, time);
  });
}

export async function initWallet(client: TonClient, publicKey: Buffer, workchain = 0) {
  const wallet = await WalletContract.create(client, WalletV3R2Source.create({ publicKey: publicKey, workchain }));
  const walletBalance = await client.getBalance(wallet.address);
  if (parseFloat(fromNano(walletBalance)) < 0.5) {
    throw `Insufficient Deployer [${wallet.address.toFriendly()}] funds ${fromNano(walletBalance)}`;
  }
  console.log(
    `Init wallet ${wallet.address.toFriendly()} | balance: ${fromNano(await client.getBalance(wallet.address))} | seqno: ${await wallet.getSeqNo()}
`
  );

  return { wallet, walletBalance };
}

export async function initDeployKey(index: string) {
  const deployConfigJson = `./build/deploy.config.json`;
  const deployerWalletType = "org.ton.wallets.v3.r2";
  let deployerMnemonic;
  if (!fs.existsSync(deployConfigJson)) {
    console.log(`\n* Config file '${deployConfigJson}' not found, creating a new wallet for deploy..`);
    deployerMnemonic = (await mnemonicNew(24)).join(" ");
    const deployWalletJsonContent = {
      created: new Date().toISOString(),
      deployerWalletType,
      deployerMnemonic,
    };
    fs.writeFileSync(deployConfigJson, JSON.stringify(deployWalletJsonContent, null, 2));
    console.log(` - Created new wallet in '${deployConfigJson}' - keep this file secret!`);
  } else {
    console.log(`\n* Config file '${deployConfigJson}' found and will be used for deployment!`);
    const deployConfigJsonContentRaw = fs.readFileSync(deployConfigJson, "utf-8");
    const deployConfigJsonContent = JSON.parse(deployConfigJsonContentRaw);
    if (!deployConfigJsonContent.deployerMnemonic) {
      console.log(` - ERROR: '${deployConfigJson}' does not have the key 'deployerMnemonic'`);
      process.exit(1);
    }
    deployerMnemonic = deployConfigJsonContent.deployerMnemonic;
  }
  return mnemonicToWalletKey(deployerMnemonic.split(" "), index);
}

export function actionToMessage(from: Address, action: OutAction, inMessage: InternalMessage, bounce = true) {
  const sendMessageAction = action as SendMsgOutAction;

  // @ts-ignore
  let messageValue = sendMessageAction.message?.info?.value.coins;
  if (sendMessageAction.mode == 64) {
    messageValue = inMessage.value;
    //console.log(`message.coins`, sendMessageAction.mode, fromNano(messageValue));
  }

  //  if (sendMessageAction.message?.info?.value.coins.toString() == "0") {
  // console.log(sendMessageAction, sendMessageAction.message, fromNano(sendMessageAction.message?.info?.value.coins));
  //  }
  let msg = new CommonMessageInfo({
    body: new CellMessage(sendMessageAction.message?.body),
  });

  return new InternalMessage({
    // @ts-ignore
    to: sendMessageAction.message?.info.dest,
    from,
    value: messageValue,
    bounce,
    body: msg,
  });
}
