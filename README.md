# Single Nominator smart contract

This is an alternative simplified implementation for the [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) smart contract, that supports a single nominator only. The benefit of this implementation is that it's more secure since the attack surface is considerably smaller. This is due to massive reduction in [complexity](https://github.com/ton-blockchain/nominator-pool/blob/main/func/pool.fc) of Nominator Pool that has to support multiple third-party nominators.

## Go-to solution for validators

This smart contract is intended to be the go-to solution for TON validators that have enough stake to validate by themselves. The other available alternatives are: 
* using a [hot wallet](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc) directly (insecure since a cold wallet is needed to prevent theft if the validator node is hacked)
* using [restricted-wallet](https://github.com/EmelyanenkoK/nomination-contract/blob/master/restricted-wallet/wallet.fc) (which is unmaintained and has unresolved attack vectors like gas drainage attacks)
* using [Nominator Pool](https://github.com/ton-blockchain/nominator-pool) with max_nominators_count = 1 (unnecessarily complex with a larger attack surface)
