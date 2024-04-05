import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "./helpers";
import { SingleNominator } from "../contracts-ts/single-nominator";
import { Address, CellMessage, CommonMessageInfo, InternalMessage, TonClient, WalletContract, toNano, StateInit, beginCell, fromNano, Cell, parseTransaction} from "ton";

import {waitForSeqno, compileFuncToB64} from "./helpers";
import { expect } from "chai";
import {Buffer} from "buffer";

const elector = Address.parse("Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF");

// const client = new TonClient({endpoint: 'http://107.6.173.98/1/mainnet/toncenter-api-v2/jsonRPC'});
// const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC", apiKey: process.env.TON_API_KEY}, );
const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC", apiKey: "3ebe42d62396ff96725e0de9e71cae2916c1b690d3ffc8a80ecd9af4e8fef6f2"});

const BLOCK_TIME = 10000;
const NOMINATOR_MIN_TON = 3;
const DEPLOYER_MIN_TON = 2;
const VALIDATOR_INDEX = 0;

const NEW_STAKE = 0x4e73744b;
const RECOVER_STAKE = 0x47657424;

const SEND_DEPOSIT_TO_NOMINATOR = 0x0;
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

const SEND_MODE_REGULAR = 0;
const SEND_MODE_PAY_FEES_SEPARETELY = 1;
const SEND_MODE_IGNORE_ERRORS = 2;
const SEND_MODE_DESTROY = 32;
const SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE = 64;
const SEND_MODE_CARRY_ALL_BALANCE = 128;

const OP_SEND = 0xa7733acd;
const OP_ADD_WHITELIST = 0x7258a69b
const OP_SEND_RESPONSE = 0xf7733acd;
const OP_RETURN_EXCESS_QUERY_ID = 0x7000;

const VESTING_CONTRACT_ADDRESS =  Address.parse('EQDCSGSPwsm3uUepnZnkGUJDQiolseqchQLdxO_0cKJ2MujJ') // 'EQCgRxFm2_5fkk1apEg_Ekj3NHktloPw7o2gd3qRFFTS3W2o'
const SN_CONTRACT_ADDRESS = Address.parse('Ef9bs--58zwqYK12NTgkRVFeeHNwY_9wGR8yxUB5Z5KYRXJD'); // Ef-zbW4OzGgarSvJcVS9PAjzF7jpIZzHNn_ck8vRyNPa5RjR

function sendDepositToNominator(nominatorAddr: Address) {
  return beginCell()
  				.storeUint(OP_SEND, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeUint(SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY, 8)
          .storeRef(
            beginCell()
            .storeUint(0x18, 6)
            .storeAddress(nominatorAddr)
            .storeCoins(toNano(0.25)) // value
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
          .endCell())
		    .endCell();  

}

function sendWithdrawToNominator(nominatorAddr: Address, withdrawAmount: number) {
  return beginCell()
  				.storeUint(OP_SEND, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeUint(SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY, 8)
          .storeRef(
            beginCell()
            .storeUint(0x18, 6)
            .storeAddress(nominatorAddr)
            .storeCoins(toNano(0.1)) // value
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .storeUint(WITHDRAW, 32)
            .storeUint(1, 64) // query id
            .storeCoins(toNano(withdrawAmount))
          .endCell())
		    .endCell();  

}

function sendChangeValidatorToNominator(nominatorAddr: Address, newValidatorAddr: Address) {
  return beginCell()
  				.storeUint(OP_SEND, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeUint(SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY, 8)
          .storeRef(
            beginCell()
            .storeUint(0x18, 6)
            .storeAddress(nominatorAddr)
            .storeCoins(toNano(0.1)) // value
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .storeUint(CHANGE_VALIDATOR_ADDRESS, 32)
            .storeUint(1, 64) // query id
            .storeAddress(newValidatorAddr)
          .endCell())
		    .endCell();  

}

function sendUpgradeToNominator(nominatorAddr: Address, newValidatorAddr: Address) {
  return beginCell()
  				.storeUint(OP_SEND, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeUint(SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY, 8)
          .storeRef(
            beginCell()
            .storeUint(0x18, 6)
            .storeAddress(nominatorAddr)
            .storeCoins(toNano(0.1)) // value
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .storeUint(UPGRADE, 32)
            .storeUint(1, 64) // query id
            .storeAddress(newValidatorAddr)
          .endCell())
		    .endCell();  

}

function addWhitelist(whitelistAddr: Address) {
  return beginCell()
  				.storeUint(OP_ADD_WHITELIST, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeAddress(whitelistAddr)
		    .endCell();  
}

function sendFundsToOwner(ownerAddr: Address) {
  return beginCell()
  				.storeUint(OP_SEND, 32)
  				.storeUint(OP_RETURN_EXCESS_QUERY_ID, 64)
  				.storeUint(SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY, 8)
          .storeRef(
            beginCell()
            .storeUint(0x18, 6)
            .storeAddress(ownerAddr)
            .storeCoins(toNano(5)) // value
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
          .endCell())
		    .endCell();  
}


async function transferFunds(
  client: TonClient,
  walletContract: WalletContract,
  privateKey: Buffer,
  contract: SingleNominator | WalletContract,
  amount = NOMINATOR_MIN_TON * 2
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

async function sendTxVestingContract(
  vestingOwner: WalletContract,
  vestingOwnerPrivateKey: Buffer,
  vestingContractAddress: Address,
  payload: Cell
) {
  let seqno = await vestingOwner.getSeqNo();
  console.log(`send message to vesting contract at address ${vestingContractAddress.toFriendly()} from owner ${vestingOwner.address.toFriendly()}`);

  const transfer = vestingOwner.createTransfer({
    secretKey: vestingOwnerPrivateKey,
    seqno: seqno,
    sendMode: 1 + 2,
    order: new InternalMessage({
      to: vestingContractAddress,
      value: toNano(0.1),
      bounce: true,
      body: new CommonMessageInfo({
        body: new CellMessage(payload)
	  }),
    }),
  });

  try {
    await client.sendExternalMessage(vestingOwner, transfer);
  
  } catch (e) {
    console.log(e);
    
    return false;
  }

  console.log(`- transaction sent successfully to vesting contract from owner-> ${vestingOwner.address.toFriendly()} [wallet seqno:${seqno}]`);
  await sleep(BLOCK_TIME);
  return true;
}

describe("e2e test suite", () => {
  let balance: number;
  let res: any;
  let deployWallet: WalletContract;
  let owner: WalletContract;
  let deployWalletKey: any;
  let vestingSenderKey: any;    
  let vestingSenderWallet: WalletContract;

  before(async () => {
    
    deployWalletKey = await initDeployKey("");    
    deployWallet = await initWallet(client, deployWalletKey.publicKey);
    owner = deployWallet;

    vestingSenderKey = await initDeployKey("1");
    vestingSenderWallet = await initWallet(client, vestingSenderKey.publicKey);

    // // console.log(deployWallet.address.toFriendly());
    // console.log(await readContractState())
    // process.exit()

    // const boc = Cell.fromBoc('b5ee9c720101010100240000438014a3b7b0fa112b5368c1af35c7f5e43015f93468028cc859701743c1f7d3c916f0')
    // console.log(boc[0].beginParse().readAddress());  
    // process.exit()
    
    console.log(`deployer contract address: ${deployWallet.address.toFriendly()}`);
    console.log(`vesting sender contract address: ${vestingSenderWallet.address.toFriendly()}`);

    balance = parseFloat(fromNano((await client.getBalance(deployWallet.address)).toNumber()));
    if (balance < DEPLOYER_MIN_TON) {
      throw `Deploy wallet balance is too small (${balance}), please send at least ${DEPLOYER_MIN_TON} coins to ${deployWallet.address.toFriendly()}`;
    }

  });

  it("Add whitelist", async () => {
    const payload = addWhitelist(SN_CONTRACT_ADDRESS);
    res = await sendTxVestingContract(vestingSenderWallet, vestingSenderKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

  
  it("Send deposit to single nominator from vesting contract", async () => {
    const payload = sendDepositToNominator(SN_CONTRACT_ADDRESS);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

  it("Send withdraw to single nominator from vesting contract", async () => {
    const payload = sendWithdrawToNominator(SN_CONTRACT_ADDRESS, 1.6);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

  it.only("Withdraw all funds (including locked) to vesting wallet ", async () => {
    const payload = sendWithdrawToNominator(vestingSenderWallet.address, 2);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });
 
  it("Send withdraw to single nominator from vesting contract", async () => {
    const payload = sendChangeValidatorToNominator(SN_CONTRACT_ADDRESS, VESTING_CONTRACT_ADDRESS);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

  it("Send withdraw to single nominator from vesting contract", async () => {
    const payload = sendUpgradeToNominator(SN_CONTRACT_ADDRESS, VESTING_CONTRACT_ADDRESS);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

  it.only("Send withdraw to single nominator from vesting contract", async () => {
    const payload = sendFundsToOwner(deployWallet.address);
    res = await sendTxVestingContract(deployWallet, deployWalletKey.secretKey, VESTING_CONTRACT_ADDRESS, payload);
    await sleep(BLOCK_TIME);
  });

});



async function readContractState() {

  const x = await client.callGetMethod(VESTING_CONTRACT_ADDRESS, 'get_vesting_data')

  console.log(x);
  console.log(x.stack[6][1])

  const cell = Cell.fromBoc(x.stack[6][1].bytes)[0];
  let slice = cell.beginParse()
  let owner = slice.readAddress();
  console.log(owner);
  
  // const cell = Cell.fromBoc(x.stack[6][1].bytes)[0];
  // let slice = cell.beginParse()
  // let owner = slice.readAddress();
  // console.log({
  //   owner: owner?.toFriendly(),
  // });
}