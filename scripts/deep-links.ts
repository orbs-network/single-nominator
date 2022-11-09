import BN from "bn.js";
import { Address, beginCell, toNano } from "ton";
const yargs = require('yargs');
const ZERO_ADDR = '-1:0000000000000000000000000000000000000000000000000000000000000000';

function buildWithdrawMessage(amount: BN) {
    return beginCell().storeUint(0x1000 ,32).storeUint(1, 64).storeCoins(amount).endCell().toBoc({idx: false}).toString("base64");
}

export function withdrawDeepLink(snominator: Address, amount: BN) : string {
    const oneTon = toNano(1);
    return `https://app.tonkeeper.com/transfer/${snominator.toFriendly()}?amount=${oneTon}&bin=${buildWithdrawMessage(amount)}`
}

function buildSetValidatorMessage(newValidator: Address) {
    return encodeURIComponent(beginCell().storeUint(0x1001 ,32).storeUint(1, 64).storeAddress(newValidator).endCell().toBoc({idx: false}).toString("base64"));
}


export function changeValidator(nominator: Address, newValidator: Address) : string {
    const value = toNano(1);
    return `https://app.tonkeeper.com/transfer/${nominator.toFriendly()}?amount=${value}&bin=${buildSetValidatorMessage(newValidator)}`;
}


function generateWithdrawDeeplink(singleNominatorAddr: string) {
    let deepLink = withdrawDeepLink(Address.parse(singleNominatorAddr), toNano(1));
    console.log(`withdraw deeplink: ${deepLink}`);
}

function generateChangeValidatorDeeplink(singleNominatorAddr: string, newValidatorAddr: string) {
    let deepLink = changeValidator(Address.parse(singleNominatorAddr), Address.parse(newValidatorAddr));
	console.log(`new_validator addr: ${newValidatorAddr}`)
    console.log(`change validator: ${deepLink}`);
}

generateWithdrawDeeplink(process.argv[2]);
generateChangeValidatorDeeplink(process.argv[2], process.argv[3] || ZERO_ADDR);
