### Fift Scripts

There are 3 fif scripts in this dir.

* str-to-addr.fif is used after deploying the nominator contract for generating .addr file. This file should be placed in ~/.local/share/mytoncore/pools/ dir and it will be used by mytonctrl. mytonctrl will search for pools in this folder (usePool should be set to true in mytonctrl to use pools). Example: `fift -s scripts/fif/str-to-addr.fif Ef-C8SHoQ72S2fgqzhtUkzFG0krKKvIeCqpn4AjyXyhUUpIz`.
* change-validator.fif is used to change the validator address. <br />
  The validator is able to send NEW_STAKE, RECOVER_STAKE messages to the nominator contract. It might be useful to change the validator address if for example the validator pk was compromised. Changing the validator address can be sent only from the owner's wallet. <br />
  The script receives a new validator address as input and generates a boc body which should be sent by the owner. <br/>
  Notice that changing validator address will not affect the funds staked at the elector, and you will be able to recover the funds. <br/>
  Example: `fift -s scripts/fif/change-validator.fif -1:0000000000000000000000000000000000000000000000000000000000000000` will generate a boc file in the running directory under the name `change-validator.boc` which changes the address to ZERO address and will effectively disable the validator. <br/>
  This file should be signed by the owner, an owner with v3 wallet should run for example (preferable from a clean computer without access to the internet): 'fift -s wallet-v3.fif my-wallet-0 Ef-C8SHoQ72S2fgqzhtUkzFG0krKKvIeCqpn4AjyXyhUUpIz 698983190 10 amount -B change-validator.boc'. <br/>
  The fift command above will generate a boc file which should be sent from a computer with access to the internet using the command: `lite-client -C global.config.json -c 'sendfile my-wallet-0-query.boc`.
* withdraw.fif is used to withdraw funds from the single-nominator contract to the owner's wallet. <br/>
  The script receives amount to withdraw and generates a boc body which should be sent by the owner. <br/>
  Example: `fift -s scripts/fif/withdraw.fif 1` will generate a boc file in the running directory under the name `withdraw.boc` which will withdraw 1 TON from nominator contract to the owner's wallet. The funds will be sent with bounceable flag and mode=64. <br/>
  This file should be signed by the owner, an owner with v3 wallet should run (preferable from a clean computer without access to the internet) : 'fift -s wallet-v3.fif my-wallet-0 wallet-addr wallet-id seqno amount -B withdraw.boc'. <br/>
  The boc created should be sent from a computer with access to the internet.
