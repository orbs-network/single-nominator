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

Coming soon - feel free to report any problem in issues

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

The restricted wallet is unmaintained (replaced by nominator-pool) and has unresolved attack vectors like gas drainage attacks. Since the same wallet holds both gas fees and the stake principal in the same balance, an attacker that compromises the private key can generate transactions that will cause significant principal losses.

---

### 3. Nominator pool

The [nominator-pool](https://github.com/ton-blockchain/nominator-pool) was the first to introduce clear separation between the owners of the stake (nominators) and the validator that is connected to the Internet. This setup supports up to 40 nominators staking together on the same validator.

<img src="https://i.imgur.com/j9WJAIk.png" width=900 />

The nominator pool contract is overly complex due to the support of 40 concurrent nominators. In addition, the contract has to protect the nominators from the contract deployer because those are separate entities. This setup is considered ok but is very difficult to audit in full due to the size of the attack surface. The solution makes sense mostly when the validator does not have enough stake to validate alone or wants to do rev-share with third-party stakeholders.

---

### 4. Single nominator

This is the setup implemented in this repo. It's a simplified version of the nominator pool that supports a single nominator and does not need to protect this nominator from the contract deployer as they are the same entity.

<img src="https://i.imgur.com/YPuRUqr.png" width=900 />

If you have a single nominator that holds all stake for validation, this is the most secure setup you can use.
