import argparse
import os
import base64
import os.path
from os import path
import json

WALLET_ID = 698983191
TIMEOUT = 86400
BOC_PARSER_ESTIMATOR = "https://ton-defi-org.github.io/boc-parser-estimator/#"
BOC_OUTPUT_FILE_NAME = "boc-output"


def parse_args():
    parser = argparse.ArgumentParser(
        prog="cold-storage",
        description="Send message from wallet to single-nominator from cold storage. Action can be withdraw, set-validator or transfer funds. User should have pk ready for use and .addr file of the "
        "wallet.\n\n"
        "Examples:\n" 
        "1. python3 scripts/fift/cold-storage.py -a withdraw -p mywallet -s 3 -t 1 -d EQBd31Rl7zrpOjGuTA7PEwmuFPFvacTF8o1HDdcQDG30huZL\n"
        "2. python3 scripts/fift/cold-storage.py -a set-validator -p mywallet -s 3 -t 1 -d EQBd31Rl7zrpOjGuTA7PEwmuFPFvacTF8o1HDdcQDG30huZL -n Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU\n"
        "3. python3 scripts/fift/cold-storage.py -a transfer -p mywallet -s 3 -t 1000 -d EQBd31Rl7zrpOjGuTA7PEwmuFPFvacTF8o1HDdcQDG30huZL\n",
        epilog="Thanks for using %(prog)s app",
        formatter_class=argparse.RawTextHelpFormatter
    )

    parser.add_argument('--action', '-a', choices=[
        'withdraw', 'set-validator', 'transfer'], help='The action to perform', required=True)
    parser.add_argument('--pk_filename', '-p', type=str,
                        help='The filename (without extension) of the private key which is used to sign the transaction', required=True)
    parser.add_argument('--seqno', '-s', type=int,
                        help='The seqno of the cold wallet that is used to sign the transaction', required=True)
    parser.add_argument('--ton_amount', '-t', type=float,
                        help='The amount of ton to send with the transaction', required=True)
    parser.add_argument('--destination', '-d', type=str,
                        help='The destination address for the transaction (should be the single nominator address)', required=True)
    parser.add_argument('--withdraw_amount', '-w', type=float,
                        help='The amount of ton to to withdraw from single nominator')
    parser.add_argument('--new_validator_address', '-n', type=str,
                        help='The new validator address for the set-validator action')

    args = parser.parse_args()
    return args


def validate_args(args):
    assert path.exists(args.pk_filename + '.pk'), "pk file not found"
    assert path.exists(args.pk_filename + '.addr'), "addr file not found"

    if args.action == 'withdraw':
        assert args.withdraw_amount is not None, 'please provide withdraw_amount'

    if args.action == 'set-validator':
        assert args.new_validator_address is not None, 'please provide new_validator_address'


def read_id_addr(file_name='addr_book.json'):
    with open(file_name, 'r') as f:
        addr_book = json.load(f)

    return addr_book


def sign_tx(args, boc_filename=None):

    if boc_filename:
        assert path.exists(boc_filename), " {} doesn't exists".format(boc_filename)
        wallet_cmd = './fift -s wallet-v3.fif {pk} {destination} {wallet_id} {seqno} {amount} --timeout {timeout} -B {boc_filename} {boc_output}' \
            .format(pk=args.pk_filename,
                    destination=args.destination,
                    wallet_id=WALLET_ID, seqno=args.seqno,
                    amount=args.ton_amount, timeout=TIMEOUT,
                    boc_filename=boc_filename,
                    boc_output=BOC_OUTPUT_FILE_NAME)
    else:
        wallet_cmd = './fift -s wallet-v3.fif {pk} {destination} {wallet_id} {seqno} {amount} --timeout {timeout} {boc_output}' \
            .format(pk=args.pk_filename,
                    destination=args.destination, wallet_id=WALLET_ID,
                    seqno=args.seqno, amount=args.ton_amount, timeout=TIMEOUT,
                    boc_output=BOC_OUTPUT_FILE_NAME)

    os.system(wallet_cmd)


def print_qr_code():
    boc_output = BOC_OUTPUT_FILE_NAME + ".boc"

    assert path.exists(boc_output), " {} doesn't exists".format(boc_output)

    with open(boc_output, "rb") as f:
        boc_buffer = f.read()

    boc_base64 = base64.b64encode(boc_buffer).decode()
    url = BOC_PARSER_ESTIMATOR + boc_base64
    print(url)
    os.system("qr '{}' ".format(url))


def main():

    args = parse_args()
    validate_args(args)

    os.system("export FIFTPATH='/home/amnesia/Tor Browser/fiftpath/fift/lib'")

    if args.action == 'withdraw':
        os.system('./fift -s withdraw.fif {}'.format(args.withdraw_amount))
        sign_tx(args, "withdraw.boc")
        print_qr_code()

    elif args.action == 'set-validator':
        os.system('./fift -s change-validator.fif {}'.format(args.new_validator_address))
        sign_tx(args, "change-validator.boc")
        print_qr_code()

    elif args.action == 'transfer':
        sign_tx(args)
        print_qr_code()


main()
