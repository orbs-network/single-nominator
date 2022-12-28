# Single Validator CLI Tool
## Intro

To use the script, you will need to provide the action you want to perform, the filename of the private key file, the sequence number of the wallet, the amount of ton to send with the transaction, and the destination address. Depending on the action, you may also need to provide additional arguments.

For example, to withdraw funds, you would use the following command:

### Dependencies
python3 - built in tails-os
fift - binary available at [fift](https://github.com/ton-defi-org/ton-binaries/releases/download/debian-10/fift)
fiftlib - the code sets the env vairable FIFTPATH , it should point to a fift lib directory , [fiftlib](https://github.com/ton-blockchain/ton/tree/master/crypto/fift/lib)
wallet-v3.fif - [wallet-v3.fif](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet-v3.fif)


## Commands 

### Withdraw 
`python3 app.py withdraw <pk_filename> <seqno> <ton_amount> --withdraw_amount <withdraw_amount> <destination>`
To set a new validator, you would use the following command:

### Set validator address
`python3 app.py setvalidator <pk_filename> <seqno> <ton_amount> <withdraw_amount> --new_validator_address <new_validator_address> <destination>`
To transfer funds, you would use the following command:

### Simple Transfer
`python3 app.py transfer <pk_filename> <seqno> <ton_amount> <withdraw_amount> <destination>`
Each time you run the script, it will execute the appropriate action, sign the transaction using the private key, and print the URL of the signed transaction in a QR code that you can scan to view the transaction details.