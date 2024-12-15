import { Cell, beginCell, Address, Contract, toNano, contractAddress, ContractProvider, Sender, SendMode, MessageRelaxed, storeMessageRelaxed } from '@ton/core';
import { buff2bigint } from '../utils';
import { signData } from './ValidatorUtils';
import { KeyPair } from 'ton-crypto';
import { OP } from './OP';

export type SingleNominatorConfig = {
    owner: Address,
    validator: Address
};

type NewStakeOpts = {
    max_factor: number,
    adnl_address: bigint,
    query_id:bigint | number ,
    value: bigint
}

export const defaultNewStake : NewStakeOpts = {
    max_factor : 1 << 16,
    adnl_address : BigInt(0),
    query_id : 1,
    value : toNano('1.2')
}

export function PoolConfigToCell(config: SingleNominatorConfig) {
    return beginCell()
            .storeAddress(config.owner)
            .storeAddress(config.validator)
           .endCell();
}
export class SingleNominator implements Contract {


    constructor(readonly address: Address, readonly init?: {code: Cell, data: Cell}, workchain = -1) {}

    static createFromAddress(address: Address) {
        return new SingleNominator(address);
    }
    static createFromConfig(opts: SingleNominatorConfig, code: Cell, workchain: 0 | -1 = -1) {
        const data = PoolConfigToCell(opts);
        const init = {code, data};
        return new SingleNominator(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, query_id: number | bigint = 0) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0, 32).storeUint(query_id, 64).endCell()
        });
    }

    static withdrawMessage(amount: bigint, query_id: bigint | number = 0) {
        return beginCell()
                .storeUint(OP.pool.WITHDRAW, 32)
                .storeUint(query_id, 64)
                .storeCoins(amount)
               .endCell();
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, amount: bigint, value:bigint = toNano('0.1'), query_id: bigint | number = 0){
        await provider.internal(via, {
            body: SingleNominator.withdrawMessage(amount),
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static changeValidatorMessage(validator: Address, query_id: bigint | number = 0) {
        return beginCell()
                .storeUint(OP.pool.CHANGE_VALIDATOR_ADDRESS, 32)
                .storeUint(query_id, 64)
                .storeAddress(validator)
               .endCell();
    }
    async sendChangeValidator(provider: ContractProvider, via: Sender, validator: Address, value: bigint = toNano('0.1'), query_id: bigint | number =0) {
        await provider.internal(via, {
            value,
            body: SingleNominator.changeValidatorMessage(validator, query_id),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static rawMessage(msg: MessageRelaxed | Cell, mode: number, query_id: number | bigint = 0) {
        let msgCell: Cell;
        if(msg instanceof Cell) {
            msgCell = msg;
        }
        else {
            msgCell = beginCell().store(storeMessageRelaxed(msg)).endCell();
        }
        return beginCell().storeUint(OP.pool.SEND_RAW_MSG, 32)
                          .storeUint(query_id, 64)
                          .storeRef(msgCell)
                          .storeUint(mode, 8)
               .endCell();
    }

    async sendRawMessage(provider: ContractProvider, via: Sender, msg: MessageRelaxed | Cell, mode: number, value: bigint = toNano('0.1'), query_id: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: SingleNominator.rawMessage(msg, mode, query_id),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static upgradeMessage(code: Cell, query_id: bigint | number = 0) {
        return beginCell()
                .storeUint(OP.pool.UPGRADE, 32)
                .storeUint(query_id, 64)
                .storeRef(code)
               .endCell();
    }

    async sendUpgradeMessage(provider: ContractProvider, via: Sender, code: Cell, value: bigint = toNano('0.1'), query_id: bigint | number = 0) {
        await provider.internal(via, {
            value,
            body: SingleNominator.upgradeMessage(code, query_id),
            sendMode: SendMode.PAY_GAS_SEPARATELY
        });
    }

    static newStakeMessage(stake_val: bigint,
	  											 src: Address,
                           keys: KeyPair,
                           stake_at: number | bigint,
                           opts: NewStakeOpts = defaultNewStake) {

        const signCell = beginCell().storeUint(OP.elector.NEW_STAKE_SIGNED, 32)
                                    .storeUint(stake_at, 32)
                                    .storeUint(opts.max_factor, 32)
                                    .storeUint(buff2bigint(src.hash), 256)
                                    .storeUint(opts.adnl_address, 256)
                         .endCell()

        const signature = signData(signCell, keys.secretKey);

        return  beginCell().storeUint(OP.elector.NEW_STAKE, 32)
                           .storeUint(opts.query_id, 64)
	  											 .storeCoins(stake_val)
                           .storeUint(buff2bigint(keys.publicKey), 256)
                           .storeUint(stake_at, 32)
                           .storeUint(opts.max_factor, 32)
                           .storeUint(opts.adnl_address, 256)
                           .storeRef(signature)
                .endCell();
  }

  async sendNewStake(provider: ContractProvider,
                     via: Sender,
										 stake_val: bigint,
                     keys: KeyPair,
                     stake_at: number | bigint,
                     opts?: Partial<NewStakeOpts>) {
      let curOpts: NewStakeOpts;
      if(opts) {
          curOpts = {
              ...defaultNewStake,
              ...opts,
          };
      }
      else {
          curOpts = {...defaultNewStake};
      }

      await provider.internal(via,{
          value: curOpts.value,
          body: SingleNominator.newStakeMessage(stake_val,
																							this.address,
                                              keys,
                                              stake_at,
                                              curOpts),
          sendMode: SendMode.PAY_GAS_SEPARATELY
      });
  }
	static recoverStakeMessage(query_id: bigint | number = 0) {
		return beginCell().storeUint(OP.elector.RECOVER_STAKE, 32).storeUint(query_id, 64).endCell();
	}

	async sendRecoverStake(provider: ContractProvider, via: Sender, value:bigint = toNano('1'), query_id: bigint | number = 0) {
		await provider.internal(via, {
			body: SingleNominator.recoverStakeMessage(query_id),
			sendMode: SendMode.PAY_GAS_SEPARATELY,
			value
		});
	}

  async getRoles(provider: ContractProvider) {
      const { stack } = await provider.get('get_roles', []);

      return {
          owner: stack.readAddress(),
          validator: stack.readAddress()
      }
  }
}
