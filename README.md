# Single Nominator smart contract

Secure validation for TON blockchain via cold wallet - a simple firewall contract that is [easy to review](https://github.com/orbs-network/single-nominator/blob/main/contracts/single-nominator.fc).

This is an alternative simplified implementation for the [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) smart contract, that supports a single nominator only. The benefit of this implementation is that it's more secure since the attack surface is considerably smaller. This is due to massive reduction in [complexity](https://github.com/ton-blockchain/nominator-pool/blob/main/func/pool.fc) of Nominator Pool that has to support multiple third-party nominators.

## The go-to solution for validators

This smart contract is intended to be the go-to solution for TON validators that have enough stake to validate by themselves. The other available alternatives are:
* using a [hot wallet](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc) (insecure since a cold wallet is needed to prevent theft if the validator node is hacked)
* using [restricted-wallet](https://github.com/EmelyanenkoK/nomination-contract/blob/master/restricted-wallet/wallet.fc) (which is unmaintained and has unresolved attack vectors like gas drainage attacks)
* using [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) with max_nominators_count = 1 (unnecessarily complex with a larger attack surface)

See a more detailed [comparison of existing alternatives](#comparison-of-existing-alternatives) below.

&nbsp;

## Architecture

The architecture is nearly identical to the [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) contract:

<img src="https://i.imgur.com/YPuRUqr.png" width=900 />

### Separation to two roles

* *Owner* - cold wallet (private key that is not connected to the Internet) that owns the funds used for staking and acts as the single nominator
* *Validator* - the wallet whose private key is on the validator node (can sign blocks but can't steal the funds used for stake)

### Workflow

1. *Owner* holds the funds for staking ($$$) in their secure cold wallet
2. *Owner* deposits the funds ($$$) in the *SingleNominator* contract (this contract)
3. *MyTonCtrl* starts running on the validator node connected to the Internet
4. *MyTonCtrl* uses *Validator* wallet to instruct *SingleNominator* to enter the next election cycle
5. *SingleNominator* sends the stake ($$$) to the *Elector* for one cycle
6. The election cycle is over and stake can be recovered
7. *MyTonCtrl* uses *Validator* wallet to instruct *SingleNominator* to recover the stake from the election cycle
8. *SingleNominator* recovers the stake ($$$) of the previous cycle from the *Elector*
9. Steps 4-8 repeat as long as *Owner* is happy to keep validating
10. *Owner* withdraws the funds ($$$) from the *SingleNominator* contract and takes them back home

&nbsp;

## Mitigated attack vectors

* The validator node requires a hot wallet to sign new blocks. This wallet is inherently insecure because its private key is connected to the Internet. Even if this key is compromised, the *Validator* cannot extract the funds used for validation. Only *Owner* can withdraw these funds.

* Even if *Validator* wallet is compromised, *Owner* can tell *SingleNominator* to change the validator address. This will prevent the attacker from interacting with *SingleNominator* further. There is no race condition here, *Owner* will always take precedence.

* *SingleNominator* balance holds the principal staking funds only - its balance is not used for gas fees. Gas money for entering election cycles is held in the *Validator* wallet. This prevents an attacker that compromised the validator from draining the principal via a gas spending attack.

* *SingleNominator* verifies the format of all operations given by *Validator* to make sure it doesn't forward invalid messages to the *Elector*.

* On emergency, for example if *Elector* contract was upgraded and changes its interface, *Owner* can still send any raw message as *SingleNominator* to recover the stake from *Elector*.

* On extreme emergency, *Owner* can set the code of *SingleNominator* and override its current logic to address unforeseen circumstances.

Some of these attack vectors cannot be mitigated using the regular [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) contract because that would allow the person running the validator to steal funds from its nominators. This is not a problem with *SingleNominator* because *Owner* and *Validator* are owned by the same party.

### Security audits

Full security audit conducted by Certik and avialable in this repo [Certik Audit](https://github.com/orbs-network/single-nominator/blob/main/certik-audit.pdf).

&nbsp;

## Using this contract

* Review the [contract](https://github.com/orbs-network/single-nominator/blob/main/contracts/single-nominator.fc) and tests to make sure you're happy with the implementation
* Install the project using `npm install` (make sure you have all dependencies from [tonstarter](https://github.com/ton-defi-org/tonstarter-contracts))
* Build the contract using `npm run build`
* Run the tests using `npm run test`
* Deploy the contract using `npm run deploy`
* The contract plugs in seamlessly to MyTonCtrl with the same interface as [Nominator Pool](https://github.com/ton-blockchain/nominator-pool)
* A single instance of the contract is used for both even and odd validation cycles (single contract config in MyTonCtrl). The stake amounts configured in MyTonCtrl must be absolute (set to half the total stake amount) to support the single instance mode.

&nbsp;

## Comparison of existing alternatives

Assuming that you are a validator with enough stake to validate by yourself, these are the alternative setups you can use with MyTonCtrl:

---

### 1. Simple hot wallet

This is the simplest setup where MyTonCtrl is connected to the same [standard wallet](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc) that holds the funds. Since this wallet is connected to the Internet, it is considered a hot wallet.

<img src="https://i.imgur.com/6svyuIL.png" width=900 />

This is insecure since an attacker can get the private key as it's connected to the Internet. With the private key the attacker can send the staking funds to anyone.

---

### 2. Restricted wallet

This setup replaces the standard wallet with a [restricted-wallet](https://github.com/EmelyanenkoK/nomination-contract/blob/master/restricted-wallet/wallet.fc) that allows outgoing transactions to be sent only to restricted destinations such as the *Elector* and the owner's address.

<img src="https://i.imgur.com/kN3LluH.png" width=900 />

The restricted wallet is unmaintained (replaced by nominator-pool) and has unresolved attack vectors like gas drainage attacks. Since the same wallet holds both gas fees and the stake principal in the same balance, an attacker that compromises the private key can generate transactions that will cause significant principal losses. In addition, there's a race condition between the attacker and the owner when trying to withdraw due to seqno collisions.

---

### 3. Nominator pool

The [nominator-pool](https://github.com/ton-blockchain/nominator-pool) was the first to introduce clear separation between the owners of the stake (nominators) and the validator that is connected to the Internet. This setup supports up to 40 nominators staking together on the same validator.

<img src="https://i.imgur.com/j9WJAIk.png" width=900 />

The nominator pool contract is overly complex due to the support of 40 concurrent nominators. In addition, the contract has to protect the nominators from the contract deployer because those are separate entities. This setup is considered ok but is very difficult to audit in full due to the size of the attack surface. The solution makes sense mostly when the validator does not have enough stake to validate alone or wants to do rev-share with third-party stakeholders.

---

### 4. Single nominator

This is the setup implemented in this repo. It's a very simplified version of the nominator pool that supports a single nominator and does not need to protect this nominator from the contract deployer as they are the same entity.

<img src="https://i.imgur.com/YPuRUqr.png" width=900 />

If you have a single nominator that holds all stake for validation, this is the most secure setup you can use. On top of the simplicity, this contract provides the owner with multiple emergency safeguards that can recover stake even in extreme scenarios like *Elector* upgrades that break the recover stake interface.


## How to deploy

In order to deploy the contract use the following procedure:
1. set the following environment variables:
* OWNER_ADDRESS
* VALIDATOR_ADDRESS
* TON_ENDPOINT (default: `https://toncenter.com/api/v2/jsonRPC`)
* TON_API_KEY <br/>
Environment variables can be set by export or using .env file. For example: `export VALIDATOR_ADDRESS=Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU` or insert `VALIDATOR_ADDRESS=Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU` to .env file.
2. run `npm run init-deploy-wallet` to init deploy wallet. The script will deploy a wallet (if not already deployed) and print its address. Make sure you have funds in this address which will be used for deployment. 1 TON should be enough for deployment. The wallet mnemonics will be stored locally at ./build/deploy.config.json. This step should be run only once to init the deploy wallet.
3. run `npm run deploy`. This script will deploy the single-nominator contract (if not already deployed) with the OWNER_ADDRESS and VALIDATOR_ADDRESS which were set as the environment variables.
4. The deployment script will print the nominator contract address. Use str-to-addr.fif to create .addr file from the base64 string representation of the contract address. <br/>
This file will be used by Mytonctrl and should be placed on the validator node at `~/.local/share/mytoncore/pools/` directory. Mytonctrl will search for pools in this folder (usePool should be set to true in Mytonctrl to use pools). <br/>
Example: `fift -s scripts/fif/str-to-addr.fif Ef-C8SHoQ72S2fgqzhtUkzFG0krKKvIeCqpn4AjyXyhUUpIz`.
5. Before moving funds to the nominator contract it is important to approve the ownership of the owner address. It is recommended to send 1 TON to the nominator contract and use the withdrawal procedure described [here](https://github.com/orbs-network/single-nominator#1-withdraw).

## Mytonctrl settings

Single nominator contract is compatible with Mytonctrl when set in usePool mode. The following steps should be taken:
1. Copy the nominator .addr file (generated as described above) to `~/.local/share/mytoncore/pools/`.
2. From Mytonctrl use:
   * `set usePool true`
   * `set stake 350000` to set the stake to 350,000. Make sure to change the stake to the desired amount.
3. Make sure you have a validator wallet whose address match the VALIDATOR_ADDRESS that used when deploying the contract. You can use `scripts/ts/read-contract-state.ts` to read the owner and validator addresses.
4. Copy all fif script located in [mytonctrl-scripts](https://github.com/orbs-network/single-nominator/tree/main/mytonctrl-scripts) to the node under `~/.local/share/mytoncore/contracts/nominator-pool/func/`. Mytonctrl will need all the scripts in order for the validator node to operate smoothly.


## Owner only messages

The nominator owner has 4 roles.

### 1. withdraw
Used to withdraw funds to the owner's wallet. To withdraw the funds the owner should send a message with a body that includes: opcode=0x1000 (32 bits), query_id (64 bits) and withdraw amount (stored as coin variable). The nominator contract will send the funds with BOUNCABLE flag and mode=64. <br/><br/>
In case the owner is using a **hot wallet** (not recommended), [withdraw-deeplink.ts](https://github.com/orbs-network/single-nominator/blob/main/scripts/ts/withdraw-deeplink.ts) can be used to generate a deeplink to initiate a withdrawal from tonkeeper wallet. <br/>
Command line: `ts-node scripts/ts/withdraw-deeplink.ts single-nominator-addr withdraw-amount` where:
* single-nominator-addr is the single nominator address the owner wishes to withdraw from.
* withdraw-amount is the amount to withdraw. The nominator contract will leave 1 TON in the contract so the actual amount that will be sent to the owner address will be the minimum between the requested amount and the contract balance - 1. <br/>
The owner should run the deeplink from a phone with the tonkeeper wallet. <br/><br/>

In case the owner is using a **cold wallet** (recommended), [withdraw.fif](https://github.com/orbs-network/single-nominator/blob/main/scripts/fif/withdraw.fif) can be used to generate a boc body which includes withdraw opcode and the amount to withdraw. <br/>
Command line: `fift -s scripts/fif/withdraw.fif withdraw-amount` where withdraw-amount is the amount to withdraw from the nominator contract to the owner's wallet. As described above the nominator contract will leave at least 1 TON in the contract. <br/>
This script will generate a boc body (named withdraw.boc) that should be signed and send from the owner's wallet. <br/>
From the black computer the owner should run:
* create and sign the tx: `fift -s wallet-v3.fif my-wallet single_nominator_address sub_wallet_id seqno amount -B withdraw.boc` where my-wallet is the owner's pk file (without extension). For amount 1 TON should be enough to pay fees (remaining amount will be returned to owner). The withdraw.boc is the boc generated above.
* from a computer with access to the internet run: `lite-client -C global.config.json -c 'sendfile wallet-query.boc'` to send the boc file (wallet-query.boc) generated in the prev step.

### 2. change-validator
Used to change the validator address. The validator can only send NEW_STAKE and RECOVER_STAKE to the elector. In case the validator private key was compromised, the validator address can be changed. Notice that in this case the funds are safe as only the owner can withdraw the funds.<br/>

In case the owner is using a **hot wallet** (not recommended), [change-validator-deeplink.ts](https://github.com/orbs-network/single-nominator/blob/main/scripts/ts/change-validator-deeplink.ts) can be used to generate a deeplink to change the validator address. <br/>
Command line: `ts-node scripts/ts/change-validator-deeplink.ts single-nominator-addr new-validator-address` where:
* single-nominator-addr is the single nominator address.
* new-validator-address (defaults to ZERO address) is the address of the new validator. If you want to immediately disable the validator and only later set a new validator it might be convenient to set the validator address to the ZERO address.
The owner should run the deeplink from a phone with tonkeeper wallet. <br/><br/>

In case the owner is using a **cold wallet** (recommended), [change-validator.fif](https://github.com/orbs-network/single-nominator/blob/main/scripts/fif/change-validator.fif) can be used to generate a boc body which includes change-validator opcode and the new validator address. <br/>
Command line: `fift -s scripts/fif/change-validator.fif new-validator-address`.
This script will generate a boc body (named change-validator.boc) that should be signed and send from the owner's wallet. <br/>
From the black computer the owner should run:
* create and sign the tx: `fift -s wallet-v3.fif my-wallet single_nominator_address sub_wallet_id seqno amount -B change-validator.boc` where my-wallet is the owner's pk file (without extension). For amount 1 TON should be enough to pay fees (remaining amount will be returned to owner). The change-validator.boc is the boc generated above.
* from a computer with access to the internet run: `lite-client -C global.config.json -c 'sendfile wallet-query.boc'` to send the boc file (wallet-query.boc) generated in the prev step.

### 3. send-raw-msg
This opcode is not expected to be used under normal conditions. <br/>
It can be used to send **any** message from the nominator contract (must be signed and sent from owner's wallet). <br/>
You might want to use this opcode if, for example, the elector contract address was unexpectedly changed and the funds are still locked in the elector. In this case RECOVER_STAKE from validator will not work and the owner will have to build a specific message. <br/>
The message body should include: opcode=0x7702 (32 bits), query_id (64 bits), mode (8 bits), reference to the cell msg which will be sent as a raw message. <br/>

### 4. upgrade
This is an emergency opcode and probably should never not be used.<br/>
It can be used to upgrade the nominator contract. <br/>
The message body should include: opcode=0x9903 (32 bits), query_id (64 bits), reference to the new cell code. <br/>


## Tests

This repo includes a test folder with an e2e test (`e2e.ts`) which should be run on testnet. The client used in the e2e test is defined by the two env variables: TON_ENDPOINT and TON_API_KEY, make sure those variables are set to testnet. <br/>
To run the e2e use: `npm run e2e`. It should deploy the nominator contract and run full e2e test. <br/>
This folder also includes a unit test file (`single-nominator.test.ts`) which uses the evm-contract-executor. <br/>
To run the unit test use: `npm run test.`

