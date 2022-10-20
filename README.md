# Single Nominator smart contract

Secure validation for TON blockchain via cold wallet - a simple firewall contract that is [easy to review](https://github.com/orbs-network/single-nominator/blob/main/contracts/single-nominator.fc).

This is an alternative simplified implementation for the [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) smart contract, that supports a single nominator only. The benefit of this implementation is that it's more secure since the attack surface is considerably smaller. This is due to massive reduction in [complexity](https://github.com/ton-blockchain/nominator-pool/blob/main/func/pool.fc) of Nominator Pool that has to support multiple third-party nominators.

## The go-to solution for validators

This smart contract is intended to be the go-to solution for TON validators that have enough stake to validate by themselves. The other available alternatives are: 
* using a [hot wallet](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc) (insecure since a cold wallet is needed to prevent theft if the validator node is hacked)
* using [restricted-wallet](https://github.com/EmelyanenkoK/nomination-contract/blob/master/restricted-wallet/wallet.fc) (which is unmaintained and has unresolved attack vectors like gas drainage attacks)
* using [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) with max_nominators_count = 1 (unnecessarily complex with a larger attack surface)

&nbsp;

## Architecture

The architecture is nearly identical to the [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) contract:

<img src="https://i.imgur.com/hDORwfm.png" width=900 />

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

## Development

* Install the project using `npm install` (make sure you have all dependencies from [tonstarter](https://github.com/ton-defi-org/tonstarter-contracts))
* Build the contract using `npm run build`
* Run the tests using `npm run test`
* Deploy the contract using `npm run deploy`
