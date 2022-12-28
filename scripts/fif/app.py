import argparse
import os
import base64
import os.path
from os import path

WALLET_ID = 698983191
timeout = 86400
parser = argparse.ArgumentParser()
boc_parser_url = "https://ton-defi-org.github.io/boc-parser-estimator/#"

parser.add_argument('action', choices=[
                    'withdraw', 'setvalidator', 'transfer'], help='The action to perform')
parser.add_argument('pk_filename', type=str,
                    help='The filename of the private key file')
parser.add_argument('seqno', type=int,
                    help='The sequence (seqno) of the wallet')
parser.add_argument('ton_amount', type=float,
                    help='The amount of ton to send with the transaction')
parser.add_argument('--withdraw_amount', type=float,
                    help='The amount of ton to send with the transaction  \n python3 app.py withdraw <pk_filename> <seqno> <ton_amount> --withdraw_amount <withdraw_amount> <destination>')
parser.add_argument('--new_validator_address', type=str,
                    help='The new validator address for the "setvalidator" action ==> \n python3 app.py setvalidator <pk_filename> <seqno> <ton_amount> <withdraw_amount> --new_validator_address <new_validator_address> <destination>')
parser.add_argument('destination', type=str,
                    help='The destination address for the transaction')
args = parser.parse_args()

assert path.exists(args.pk_filename), "pk_filename file must exists"


os.system("export FIFTPATH='/Users/user/src/ton/crypto/fift/lib'")


def sign_print_qr(boc_filename=None, boc_output="outboc"):

    assert path.exists(boc_filename), " {} doesn't exists".format(boc_filename)
    if boc_filename:
        walletCmd = 'fift -s wallet-v3.fif pk {destination} {wallet_id} {seqno} {amount} --timeout {timeout} -B {boc_filename} {boc_output}'.format(
            destination=args.destination, wallet_id=WALLET_ID, seqno=args.seqno, amount=args.ton_amount, timeout=timeout, boc_filename=boc_filename, boc_output=boc_output)
    else:
        walletCmd = 'fift -s wallet-v3.fif pk {destination} {wallet_id} {seqno} {amount} --timeout {timeout} {boc_output}'.format(
            destination=args.destination, wallet_id=WALLET_ID, seqno=args.seqno, amount=args.ton_amount, timeout=timeout, boc_output=boc_output)

    os.system(walletCmd)

    boc_output += ".boc"

    assert path.exists(
        boc_output), " {} doesn't exists".format(boc_output)

    with open(boc_output, "rb") as f:
        boc_buffer = f.read()

    boc_base64 = base64.b64encode(boc_buffer).decode()
    url = "https://ton-defi-org.github.io/boc-parser-estimator/#" + boc_base64
    print(url)
    # os.system("qrencode -t ANSI -o - '{}' ".format(url))
    os.system("qr '{}' ".format(url))


if args.action == 'withdraw':
    os.system('fift -s withdraw.fif {}'.format(args.withdraw_amount))
    sign_print_qr("withdraw.boc")


elif args.action == 'setvalidator':
    os.system('fift -s setvalidator.fif {}'.format(args.new_validator_address))
    sign_print_qr("change-validator.boc")


elif args.action == 'transfer':
    sign_print_qr(None, "transfer.boc")
