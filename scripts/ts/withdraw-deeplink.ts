import BN from "bn.js";
import { Address, beginCell, toNano } from "ton";


function buildWithdrawMessage(amount: BN) {
    return beginCell().storeUint(0x1000 ,32).storeUint(1, 64).storeCoins(amount).endCell().toBoc({idx: false}).toString("base64");
}

export function withdrawDeepLink(snominator: Address, amount: BN) : string {
    return `https://app.tonkeeper.com/transfer/${snominator.toFriendly()}?amount=${toNano(1)}&bin=${buildWithdrawMessage(amount)}`
}

function generateWithdrawDeeplink(singleNominatorAddr: string, amount: string) {
    let deepLink = withdrawDeepLink(Address.parse(singleNominatorAddr), toNano(Number(amount)));
    console.log(`withdraw deeplink: ${deepLink}`);
}


// params: nominator-addr, amount
generateWithdrawDeeplink(process.argv[2], process.argv[3]);
