import { waitForContractToBeDeployed, sleep, initWallet, initDeployKey } from "../test/helpers";
import { SingleNominator } from "../contracts-ts/single-nominator";
import { toNano, beginCell, internal } from "@ton/ton";
import { config, client } from "./config";

const NOMINATOR_MIN_TON = 2;

async function deploy() {
  const contract = client.open(SingleNominator.create({ owner: config.owner, validator: config.validator }));
  console.log(`config.owner: ${config.owner.toString()}`);

  let deployWalletKey = await initDeployKey("");
  let deployWallet = await initWallet(client, deployWalletKey.publicKey);

  if (await client.isContractDeployed(contract.address)) {
    console.log(`contract: ${contract.address.toString()} already Deployed`);
    return contract;
  }
  const balance = await deployWallet.getBalance();
  if (balance <= toNano(NOMINATOR_MIN_TON)) {
    throw `insfucient funds to deploy single nominator contract wallet have only ${balance}`;
  }

  const seqno = await deployWallet.getSeqno();
  const transfer = deployWallet.createTransfer({
    secretKey: deployWalletKey.secretKey,
    seqno: seqno,
    sendMode: 1 + 2,
    messages: [
      internal({
        to: contract.address,
        value: toNano(NOMINATOR_MIN_TON),
        bounce: false,
        body: beginCell().endCell(),
        init: { data: contract.init_.data, code: contract.init_.code },
      }),
    ],
  });

  await client.sendExternalMessage(deployWallet, transfer);
  let isDeployed = await waitForContractToBeDeployed(client, contract.address);
  if (!isDeployed) {
    throw `single nominator failed to deploy`;
  }
  console.log(`- Deploy transaction sent successfully to -> ${contract.address.toString()} [seqno:${seqno}]`);
  await sleep(10000);
  return contract;
}

deploy()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
