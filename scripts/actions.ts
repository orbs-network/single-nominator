import BN from "bn.js";
import { Address, beginCell, toNano } from "ton";


function buildWithdrawMessage(amount: BN) {
    return beginCell().storeUint(4100 ,32).storeUint(1, 64).storeCoins(amount).endCell().toBoc({idx: false}).toString("base64");
}

export function withdrawDeepLink(snominator: Address, amount: BN) : string {
    const oneTon = toNano(1);
    return `https://app.tonkeeper.com/transfer/${snominator.toFriendly()}?amount=${oneTon}&bin=${buildWithdrawMessage(amount)}`
}

function buildSetValidatorMessage(newValidator: Address) {
    return encodeURIComponent(beginCell().storeUint(4099 ,32).storeUint(1, 64).storeAddress(newValidator).endCell().toBoc({idx: false}).toString("base64"));
}


export function changeValidator(snominator: Address, newValidator: Address) : string {
    const value = toNano(0.5);
    return `https://app.tonkeeper.com/transfer/${snominator.toFriendly()}?amount=${value}&bin=${buildSetValidatorMessage(newValidator)}`;
}


function test() {

    const SingleNominator = Address.parse("Ef_gsQlhGpspMFSfaOWGK-nH-VoNv9pMs9R9qJx5-eCZP_rl");
    let withdrawDeepL = withdrawDeepLink(SingleNominator, toNano(10));
    console.log(`withdraw deeplink: ${withdrawDeepL}`);
    
    let myAddress = Address.parse("kQCBSL-sFQs_c6hL1FJLjWSQ-haHef12IK5j6AYtgxmiudIw");
    let setValidatorL = changeValidator(SingleNominator, myAddress);
    console.log(`set validator: ${setValidatorL}`);
}
test();