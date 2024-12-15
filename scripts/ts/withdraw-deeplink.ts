import { Address, beginCell, toNano } from "@ton/core";
import { toUrlSafe } from "./utils";


function buildWithdrawMessage(amount: bigint) {
    let bocStr = beginCell().storeUint(0x1000 ,32).storeUint(1, 64).storeCoins(amount).endCell().toBoc({idx: false}).toString("base64");
    return toUrlSafe(bocStr);
}

export function withdrawDeepLink(snominator: Address, amount: bigint) : string {
    return `https://app.tonkeeper.com/transfer/${snominator.toString()}?amount=${toNano(1)}&bin=${buildWithdrawMessage(amount)}`
}

function generateWithdrawDeeplink(singleNominatorAddr: string, amount: string) {
    let deepLink = withdrawDeepLink(Address.parse(singleNominatorAddr), toNano(Number(amount)));
    console.log(`withdraw deeplink: ${deepLink}`);
}


// params: nominator-addr, amount
generateWithdrawDeeplink(process.argv[2], process.argv[3]);
