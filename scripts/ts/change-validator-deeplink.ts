import { Address, beginCell, toNano } from "ton";
import { toUrlSafe } from "./utils";
const ZERO_ADDR = '-1:0000000000000000000000000000000000000000000000000000000000000000';


function buildSetValidatorMessage(newValidator: Address) {
    return toUrlSafe(beginCell().storeUint(0x1001 ,32).storeUint(1, 64).storeAddress(newValidator).endCell().toBoc({idx: false}).toString("base64"));
}

export function changeValidator(nominator: Address, newValidator: Address) : string {
    const value = toNano(1);
    return `https://app.tonkeeper.com/transfer/${nominator.toFriendly()}?amount=${value}&bin=${buildSetValidatorMessage(newValidator)}`;
}

function generateChangeValidatorDeeplink(singleNominatorAddr: string, newValidatorAddr: string) {
    let deepLink = changeValidator(Address.parse(singleNominatorAddr), Address.parse(newValidatorAddr));
	console.log(`new_validator addr: ${newValidatorAddr}`)
    console.log(`change validator deeplink: ${deepLink}`);
}

// params: nominator-addr, new-validator-addr (defaults to ZERO address)
generateChangeValidatorDeeplink(process.argv[2], process.argv[3] || ZERO_ADDR);
