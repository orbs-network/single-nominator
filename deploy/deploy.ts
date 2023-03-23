import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "../test/helpers";
import { SingleNominator } from "../contracts-ts/single-nominator";
import { CommonMessageInfo, InternalMessage, toNano, StateInit} from "ton";
import {config, client} from "./config";

const NOMINATOR_MIN_TON = 2;


async function deploy() {
	
  const contract = await SingleNominator.create({owner: config.owner, validator: config.validator});
  console.log(`config.owner: ${config.owner.toFriendly()}`);

  let deployWalletKey = await initDeployKey("");
  let deployWallet = await initWallet(client, deployWalletKey.publicKey);	

  if (await client.isContractDeployed(contract.address)) {
    console.log(`contract: ${contract.address.toFriendly()} already Deployed`);
    return contract;
  }
  const balance = await client.getBalance(deployWallet.address);
  if ( balance.lte(toNano(NOMINATOR_MIN_TON)) ) {
    throw `insfucient funds to deploy single nominator contract wallet have only ${balance}`;
  }

  const seqno = await deployWallet.getSeqNo();
  const transfer = await deployWallet.createTransfer({
    secretKey: deployWalletKey.secretKey,
    seqno: seqno,
    sendMode: 1 + 2,
    order: new InternalMessage({
	to: contract.address,
      value: toNano(NOMINATOR_MIN_TON),
      bounce: false,
      body: new CommonMessageInfo({
        stateInit: new StateInit({data: contract.source.initialData, code: contract.source.initialCode}),
        body: null,
      }),
    }),
  });

  await client.sendExternalMessage(deployWallet, transfer);
  let isDeployed = await waitForContractToBeDeployed(client, contract.address);
  if(!isDeployed) {
	throw `single nominator failed to deploy`
  }
  console.log(`- Deploy transaction sent successfully to -> ${contract.address.toFriendly()} [seqno:${seqno}]`);
  await sleep(10000);
  return contract;
}

deploy().then(
    () => {
        console.log('Done');
        process.exit(0);
    }).catch(
   (e) => {
        console.error(e);
        process.exit(1);
    });
