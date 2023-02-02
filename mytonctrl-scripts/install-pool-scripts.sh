#!/bin/bash
cd /home/ubuntu/.local/share/mytoncore/contracts/
mkdir nominator-pool
cd nominator-pool
mkdir func
cd func

wget https://raw.githubusercontent.com/orbs-network/single-nominator/main/mytonctrl-scripts/recover-stake.fif
wget https://raw.githubusercontent.com/orbs-network/single-nominator/main/mytonctrl-scripts/validator-elect-signed.fif
wget https://raw.githubusercontent.com/orbs-network/single-nominator/main/mytonctrl-scripts/validator-withdraw.fif

echo "all files downloaded "