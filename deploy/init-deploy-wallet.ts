import { initWallet, initDeployKey } from "../test/helpers";
import {client} from "./config";

async function initDeployWallet() {
	let deployWalletKey = await initDeployKey("");
	let deployWallet = await initWallet(client, deployWalletKey.publicKey);
	console.log(`deployWallet address: ${deployWallet.address.toFriendly()}`);
}

initDeployWallet().then(
    () => {
        console.log('Done');
        process.exit(0);
    }).catch(
   (e) => {
        console.error(e);
        process.exit(1);
    });
