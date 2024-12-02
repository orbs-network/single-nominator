import { Address, toNano, Cell, beginCell, Sender, SendMode, internal as internal_relaxed } from '@ton/core';
import { compile } from "@ton/blueprint";
import { Blockchain, BlockchainSnapshot, SandboxContract, SendMessageResult, SmartContract, TreasuryContract, createShardAccount, internal } from '@ton/sandbox';
import '@ton/test-utils';
import { KeyPair, getSecureRandomBytes, keyPairFromSeed } from 'ton-crypto';
import { SingleNominator } from '../wrappers/SingleNominator';
import { getElectionsConf, getStakeConf, getValidatorsConf, getVset, loadConfig, packStakeConf, packValidatorsConf } from '../wrappers/ValidatorUtils';
import { ElectorTest } from '../wrappers/ElectorTest';
import { buff2bigint, getRandomInt } from '../utils';
import { ConfigTest } from '../wrappers/ConfigTest';
import { OP } from '../wrappers/OP';
import { collectCellStats, computeMessageForwardFees, computedGeneric, getMsgPrices, storageGeneric } from '../gasUtils';
import { ERROR } from '../wrappers/Errors';
import { findTransactionRequired } from '@ton/test-utils';

type Validator = {
  wallet: SandboxContract<TreasuryContract>,
  keys: KeyPair
};

describe('Single nominator pool', () => {
  let blockchain: Blockchain;
  let code: Cell;
  let owner: SandboxContract<TreasuryContract>;
  let validator: Validator;
  let validatorSet: Validator[];

  let pool: SandboxContract<SingleNominator>;
  let elector: SandboxContract<ElectorTest>;
  let config: SandboxContract<ConfigTest>;

  let initialState: BlockchainSnapshot;
  let sConf : ReturnType<typeof getStakeConf>;
  let vConf : ReturnType<typeof getValidatorsConf>;
  let eConf : ReturnType<typeof getElectionsConf>;
  let msgConf:ReturnType<typeof getMsgPrices>;

  let getCurTime:() => number;
  let getContractData:(address: Address) => Promise<Cell>;
  let getPoolCode: () => Promise<Cell>;
  let announceElections:() => Promise<number>;
  let runElections:(profitable?: boolean) => Promise<void>;
  let updateConfig:() => Promise<Cell>;
  let waitNextRound:() => Promise<void>;

  const minStorage = toNano('1');
  beforeAll(async () => {

    code = await compile('SingleNominator');
    const configCode  = await compile('Config');
    const electorCode = await compile('Elector');

    blockchain = await Blockchain.create();
    // Masterchain is not necessery but convinient for test new stake op from the owner
    owner = await blockchain.treasury('owner_wallet', { workchain: -1, balance: toNano('5000000') });

    const confDict = loadConfig(blockchain.config);
    sConf = getStakeConf(confDict);
    vConf = getValidatorsConf(confDict);
    eConf = getElectionsConf(confDict)
    msgConf = getMsgPrices(blockchain.config, -1);

    const keyBuff = Buffer.from('validator wallet key');
    const padding = Buffer.alloc(32 - Math.min(32, keyBuff.length),'!');

    validator  = {
      wallet: await blockchain.treasury('validator_wallet', {workchain: -1}),
      keys: keyPairFromSeed(Buffer.concat([keyBuff, padding]))
    };

    const validatorsCount   = 5;
    const validatorsWallets = await blockchain.createWallets(validatorsCount, {workchain: -1});

    validatorSet = [];

    for (let i = 0; i < validatorsCount; i++) {
      validatorSet.push({
        wallet: validatorsWallets[i],
        keys: await keyPairFromSeed(await getSecureRandomBytes(32))
      })
    }

    vConf.min_validators  = validatorsCount;
    sConf.min_total_stake = BigInt(validatorsCount) * sConf.min_stake;

    confDict.set(17, packStakeConf(sConf));
    confDict.set(16, packValidatorsConf(vConf));
    blockchain.setConfig(beginCell().storeDictDirect(confDict).endCell());

    pool = blockchain.openContract(SingleNominator.createFromConfig({
      owner: owner.address,
      validator: validator.wallet.address
    }, code));

    const res = await pool.sendDeploy(owner.getSender(), sConf.min_stake * BigInt(3));

    expect(res.transactions).toHaveTransaction({
      on: pool.address,
      from: owner.address,
      aborted: false,
      deploy: true
    });

    const roles = await pool.getRoles();

    expect(roles.owner).toEqualAddress(owner.address);
    expect(roles.validator).toEqualAddress(validator.wallet.address);

    const electorAddress = Address.parse('Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF');
    const configAddress  = Address.parse('Ef9VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVbxn');

    await blockchain.setShardAccount(electorAddress, createShardAccount({
      address: electorAddress,
      code: electorCode,
      //data: ElectorTest.electionsAnnounced(bc.config),
      data: ElectorTest.emptyState(buff2bigint(confDict.get(34)!.hash())),
      balance: toNano('1000')
    }));

    await blockchain.setShardAccount(configAddress, createShardAccount({
      address: configAddress,
      code: configCode,
      data: ConfigTest.configState(blockchain.config),
      balance: toNano('1000')
    }));

    config  = blockchain.openContract(ConfigTest.createFromAddress(configAddress));
    elector = blockchain.openContract(ElectorTest.createFromAddress(electorAddress));

    initialState = blockchain.snapshot();


    getCurTime = () => blockchain.now ?? Math.floor(Date.now() / 1000);
    getContractData = async (address: Address) => {
      const smc = await blockchain.getContract(address);
      if(!smc.account.account)
        throw("Account not found")
      if(smc.account.account.storage.state.type != "active" )
        throw("Atempting to get data on inactive account");
      if(!smc.account.account.storage.state.state.data)
        throw("Data is not present");
      return smc.account.account.storage.state.state.data
    }
    getPoolCode = async () => {
      const smc = await blockchain.getContract(pool.address);
      if(!smc.account.account) {
        throw new Error("Account not found!");
      }
      if(smc.account.account.storage.state.type !== 'active') {
        throw new Error("Account is not active!");
      }
      if(!smc.account.account.storage.state.state.code) {
        throw new Error("No code present!");
      }

      return smc.account.account.storage.state.state.code;
    }
    announceElections = async () => {
      const curVset = getVset(blockchain.config, 34);
      const curTime = getCurTime();
      const electBegin = curVset.utime_unitl - eConf.begin_before + 1;

      const prevElections = await elector.getActiveElectionId();

      if(curTime < electBegin) {
          blockchain.now = electBegin;
      }
      else if(prevElections != 0) {
          // Either not closed yet because of time or lack of stake
          return prevElections;
      }

      let curElections = prevElections;

      do {
          await elector.sendTickTock("tick");
          curElections = await elector.getActiveElectionId();
      } while(curElections == 0 || prevElections == curElections);

      return curElections;
    }
    runElections = async (profitable: boolean = true) => {
      await announceElections();
      if(profitable) {
        // Elector profits
        await blockchain.sendMessage(internal({
          from: new Address(-1, Buffer.alloc(32, 0)),
          to: elector.address,
          body: beginCell().endCell(),
          value: toNano('100000'),
        }));
      }

      let electState  = await elector.getParticipantListExtended();
      const partCount = electState.list.length;
      let curStake    = electState.total_stake;
      let stakeSize   = sConf.min_stake + toNano('1');
      let i           = 0;

      while(i < validatorSet.length
            && (curStake < sConf.min_total_stake || i + partCount < vConf.min_validators)) {
        const validator = validatorSet[i++];
        const hasStake  = await elector.getReturnedStake(validator.wallet.address);
        if(hasStake > 0n) {
            // Get stake back
            const rec = await elector.sendRecoverStake(validator.wallet.getSender());
            expect(rec.transactions).toHaveTransaction({
                from: elector.address,
                to: validator.wallet.address,
                op: OP.elector.RECOVER_STAKE_OK
            });
        }
        const res = await elector.sendNewStake(validator.wallet.getSender(),
                                               stakeSize,
                                               validator.wallet.address,
                                               validator.keys.publicKey,
                                               validator.keys.secretKey,
                                               electState.elect_at);
        expect(res.transactions).toHaveTransaction({
          from: elector.address,
          to: validator.wallet.address,
          op: OP.elector.NEW_STAKE_OK
        });
        curStake += stakeSize;
      }

      // Skipping time till elections
      blockchain.now    = electState.elect_at;
      // Run elections
      const res = await elector.sendTickTock("tock");

      electState = await elector.getParticipantListExtended();
      expect(electState.finished).toBe(true);
      // Updating active vset
      await elector.sendTickTock("tock");
      await updateConfig();
    }
    updateConfig = async () => {
      const confData = await getContractData(configAddress);
      const confCell = confData.beginParse().preloadRef();
      blockchain.setConfig(confCell);
      return confCell;
    }
    waitNextRound = async () => {
      const nextVset = getVset(blockchain.config, 36);
      // Setting vset
      blockchain.now = nextVset.utime_since;
      await config.sendTickTock("tock");
      const newConf = await updateConfig();
      // Should change to the current vset
      const newVset = getVset(newConf, 34);
      expect(newVset).toEqual(nextVset);
      await elector.sendTickTock("tick");
    }
  });
  it('should deploy', async () => {
  });
  describe('Admin actions', () => {
    beforeAll(async () => await blockchain.loadFrom(initialState));
    afterEach(async () => await blockchain.loadFrom(initialState));
    it('owner should be able to withdraw', async () => {
      const msgVal = toNano('0.1');
      const withdrawAmount = BigInt(getRandomInt(1, 1000)) * toNano('1');
      const smc = await blockchain.getContract(pool.address);
      const balanceBefore = smc.balance;

      const res = await pool.sendWithdraw(owner.getSender(), withdrawAmount, msgVal);
      const withdrawTx = findTransactionRequired(res.transactions, {
        on: pool.address,
        from: owner.address,
        op: OP.pool.WITHDRAW,
        aborted: false,
      });

      const computed = computedGeneric(withdrawTx);
      const storage  = storageGeneric(withdrawTx);

      expect(res.transactions).toHaveTransaction({
        on: owner.address,
        from: pool.address,
        value: withdrawAmount + msgVal - computed.gasFees - msgConf.lumpPrice,
        aborted: false
      });
      expect(smc.balance).toEqual(balanceBefore - withdrawAmount - storage.storageFeesCollected);
    });
    it('owner should be able to withdraw with comment', async () => {
      const msgVal = toNano('0.1');
      const smc    = await blockchain.getContract(pool.address);
      const available = smc.balance - minStorage;
      const commentBody = beginCell().storeUint(0, 32).storeStringTail("w").endCell();
      const res    = await owner.send({
        to: pool.address,
        body: commentBody,
        value: msgVal,
        sendMode: SendMode.PAY_GAS_SEPARATELY
      });

      const withdrawTx = findTransactionRequired(res.transactions,{
        on: pool.address,
        from: owner.address,
        body: commentBody,
        aborted: false,
        outMessagesCount: 1
      });

      const computed = computedGeneric(withdrawTx);
      const storage  = storageGeneric(withdrawTx);

      expect(res.transactions).toHaveTransaction({
        on: owner.address,
        from: pool.address,
        value: available + msgVal - computed.gasFees - storage.storageFeesCollected - msgConf.lumpPrice,
        inMessageBounced: false
      });
      expect(smc.balance).toEqual(minStorage);
    });
    it('non owner should not be able to withdraw with message', async () => {
      const randomDude  = await blockchain.treasury('random_dude');
      const stateBefore = await getContractData(pool.address);
      for(let testWallet of [randomDude, validator.wallet]) {
        const res = await testWallet.send({
          to: pool.address,
          body: beginCell().storeUint(0, 32).storeStringTail("w").endCell(),
          value: toNano('0.1'),
          sendMode: SendMode.PAY_GAS_SEPARATELY
        });
        expect(res.transactions).not.toHaveTransaction({
          on: testWallet.address,
          from: pool.address,
          inMessageBounced: false
        });
        expect(await getContractData(pool.address)).toEqualCell(stateBefore);
      }
    });
    it('non-owner should not be able to withdraw', async () => {
      const stateBefore = await getContractData(pool.address);
      const randomDude  = await blockchain.treasury('random_dude');
      const msgVal = toNano('0.1');
      const withdrawAmount = BigInt(getRandomInt(1, 1000)) * toNano('1');

      for(let testWallet of [randomDude, validator.wallet]) {
        const res = await pool.sendWithdraw(testWallet.getSender(), withdrawAmount, msgVal);
        // No outgoing transactions from pool expected
        expect(res.transactions).not.toHaveTransaction({
          from: pool.address
        });
        expect(await getContractData(pool.address)).toEqualCell(stateBefore);
      }
    });
    it('should retain 1 ton for storage regardless of withdraw amount', async () => {
      const minStorage = toNano('1');
      const smc = await blockchain.getContract(pool.address);
      const balanceBefore = await smc.balance;

      let res = await pool.sendWithdraw(owner.getSender(), balanceBefore);

      expect(res.transactions).toHaveTransaction({
        on: owner.address,
        from: pool.address,
        value: (v) => v! < balanceBefore
      });
      expect(smc.balance).toEqual(minStorage);

      res = await pool.sendWithdraw(owner.getSender(), balanceBefore);
      expect(res.transactions).toHaveTransaction({
        on: pool.address,
        from: owner.address,
        aborted: true,
        exitCode: ERROR.pool.INSUFFICIENT_BALANCE
      });
    });
    it('owner should be able to switch validator address', async () => {
      const newValidator = await blockchain.treasury('new_validator', {workchain: -1});
      const newKeys      = keyPairFromSeed(await getSecureRandomBytes(32));
      const rolesBefore  = await pool.getRoles();

      let   res = await pool.sendChangeValidator(owner.getSender(), newValidator.address);
      expect(res.transactions).toHaveTransaction({
        on: pool.address,
        from: owner.address,
        op: OP.pool.CHANGE_VALIDATOR_ADDRESS,
        aborted: false
      });

      expect((await pool.getRoles()).validator).toEqualAddress(newValidator.address);
      // Just in case let's make sure that it is taken into account in validator ops
      const electId = await announceElections();
      res = await pool.sendNewStake(validator.wallet.getSender(),
                                    sConf.min_stake,
                                    validator.keys,
                                    electId);
      // Nothing went from pool to elector
      expect(res.transactions).not.toHaveTransaction({
        on: elector.address,
        from: pool.address
      });
      res = await pool.sendNewStake(newValidator.getSender(),
                                    sConf.min_stake,
                                    newKeys,
                                    electId);
      // With new validator it succeeds
      expect(res.transactions).toHaveTransaction({
        on: pool.address,
        from: elector.address,
        op: OP.elector.NEW_STAKE_OK
      });

      res = await pool.sendRecoverStake(validator.wallet.getSender());
      // All we care is if pool is going to proxy recovery to elector
      // elector response doesn't matter in that case.
      expect(res.transactions).not.toHaveTransaction({
        on: elector.address,
        from: pool.address
      });

      res = await pool.sendRecoverStake(newValidator.getSender());
      expect(res.transactions).toHaveTransaction({
        on: elector.address,
        from: pool.address,
        op: OP.elector.RECOVER_STAKE
      });
    });
    it('non-owner should not be able to change validator address', async () => {
      const randomDude   = await blockchain.treasury('random_dude');
      const newValidator = await blockchain.treasury('new_validator', {workchain: -1});
      const stateBefore  = await getContractData(pool.address);

      for(let testWallet of [randomDude, validator.wallet]) {
        const res = await pool.sendChangeValidator(testWallet.getSender(), newValidator.address);
        expect(await getContractData(pool.address)).toEqualCell(stateBefore);
      }
    });
    it('owner should be able to send arbitrary message from pool', async () => {
      const randomDude = await blockchain.treasury('random_dude');
      const msgValue   = toNano('1');
      const testBody   = beginCell().storeCoins(getRandomInt(1, 100000)).endCell();
      const res = await pool.sendRawMessage(owner.getSender(), internal_relaxed({
        to: randomDude.address,
        value: 0n,
        body: testBody
      }), 64, msgValue);

      const sendMsgTx = findTransactionRequired(res.transactions, {
          on: pool.address,
          from: owner.address,
          op: OP.pool.SEND_RAW_MSG,
          aborted: false,
          outMessagesCount: 1
      });

      const msg      = sendMsgTx.outMessages.get(0)!;
      const msgFee   = computeMessageForwardFees(msgConf, msg);
      const computed = computedGeneric(sendMsgTx);
      const storage  = storageGeneric(sendMsgTx);
      expect(res.transactions).toHaveTransaction({
        on: randomDude.address,
        from: pool.address,
        body: testBody,
        value: msgValue - computed.gasFees - msgFee.fees.total
      });
     });
     it('non-owner should not be able to send arbitrary message', async () => {
       const randomDude = await blockchain.treasury('random_dude');
       const msgValue   = toNano('1');
       const testBody   = beginCell().storeCoins(getRandomInt(1, 100000)).endCell();

       for(let testWallet of [randomDude, validator.wallet]) {
         const res = await pool.sendRawMessage(testWallet.getSender(), internal_relaxed({
           to: randomDude.address,
           value: 0n,
           body: testBody
         }), 64, msgValue);
         expect(res.transactions).toHaveTransaction({
           on: pool.address,
           from: testWallet.address,
           op: OP.pool.SEND_RAW_MSG,
           aborted: false,
           outMessagesCount: 0
         });
       }
     });
     it('owner should be able to upgrade code', async () => {
       const codeMock = beginCell().storeCoins(getRandomInt(1, 100000)).endCell();

       const res = await pool.sendUpgradeMessage(owner.getSender(), codeMock);
       expect(await getPoolCode()).toEqualCell(codeMock);
     });
     it('non-owner should not be able to upgrade code', async () => {
       const randomDude = await blockchain.treasury('random_dude');
       const codeMock   = beginCell().storeCoins(getRandomInt(1, 100000)).endCell();
       const codeBefore = await getPoolCode();
       for(let testWallet of [randomDude, validator.wallet]) {
        const res = await pool.sendUpgradeMessage(testWallet.getSender(), codeMock);
        expect(await getPoolCode()).toEqualCell(codeBefore);
       }
     });
  });
  describe('Validator', () => {
    let assertNewStake: (poolAddr: Address, res: SendMessageResult, exp: number, state?: Cell ) => Promise<void>;
    let electId: number;
    let stateBefore: Cell
    let electionsAnnounced: BlockchainSnapshot;
    let preRecover: BlockchainSnapshot;

    beforeAll(async () => {

      electId = await announceElections();
      electionsAnnounced = blockchain.snapshot();
      stateBefore = await getContractData(pool.address);

      assertNewStake = async (addr, res, exp, state) => {
        expect(res.transactions).toHaveTransaction({
          on: addr,
          aborted: exp != 0,
          exitCode: exp
        });
        if(exp == 0 && state == undefined) {
          expect(res.transactions).toHaveTransaction({
            on: addr,
            from: elector.address,
            op: OP.elector.NEW_STAKE_OK,
            aborted: false
          });
        }
        else {
          expect(res.transactions).not.toHaveTransaction({
            from: addr,
            to: elector.address
          });
          if(state) {
            expect(await getContractData(addr)).toEqualCell(state);
          }
        }
      }
    });

    afterAll(async () => await blockchain.loadFrom(initialState));

    beforeEach(async () => await blockchain.loadFrom(electionsAnnounced));

    it('only validator should be able to deposit from pool', async () => {
      const randomWallet = await blockchain.treasury('totally_random', { workchain: -1 });

      let res = await pool.sendNewStake(randomWallet.getSender(),
                                        sConf.min_stake,
                                        validator.keys,
                                        electId);
      // Execution successfull, but state shouldn't change
      await assertNewStake(pool.address, res, 0, stateBefore);
      // Not even owner
      res = await pool.sendNewStake(owner.getSender(),
                                    sConf.min_stake,
                                    validator.keys,
                                    electId);
      await assertNewStake(pool.address, res, 0, stateBefore);
      // Now should succeed
      res = await pool.sendNewStake(validator.wallet.getSender(),
                                    sConf.min_stake,
                                    validator.keys,
                                    electId);
      await assertNewStake(pool.address, res, 0);

      const stake = await elector.getParticipatesIn(validator.keys.publicKey);
      // Greater than because of leftowers from 1.2 TON fee
      expect(stake).toBeGreaterThanOrEqual(sConf.min_stake);
    });
    it('should only be accepted from masterchain', async () => {
      const badWc = await blockchain.treasury('validator_wallet', {workchain: 0});
      // Self check
      expect(badWc.address.hash.equals(validator.wallet.address.hash)).toBe(true);

      const missCfg = blockchain.openContract(SingleNominator.createFromConfig({
        owner: owner.address,
        validator: badWc.address
      }, code));

      const deploy = await missCfg.sendDeploy(owner.getSender(), sConf.min_stake * 2n);
      expect(deploy.transactions).toHaveTransaction({
        on: missCfg.address,
        from: owner.address,
        deploy: true,
        aborted: false
      });

      const roles = await missCfg.getRoles();
      expect(roles.validator).toEqualAddress(badWc.address);

      const stateBefore = await getContractData(missCfg.address);

      const res = await missCfg.sendNewStake(badWc.getSender(),
                                          sConf.min_stake,
                                          validator.keys,
                                          electId);
      await assertNewStake(missCfg.address, res, ERROR.pool.WRONG_VALIDATOR_WC, stateBefore);
    });
    it('pool should be deployed to masterchain to send stakes', async () => {
      const missCfg = blockchain.openContract(SingleNominator.createFromConfig({
        owner: owner.address,
        validator: validator.wallet.address
      }, code, 0));
      // Self test
      expect(missCfg.address.workChain).toBe(0);

      const deploy = await missCfg.sendDeploy(owner.getSender(), sConf.min_stake * 2n);
      expect(deploy.transactions).toHaveTransaction({
        on: missCfg.address,
        from: owner.address,
        deploy: true,
        aborted: false
      });
      const stateBefore = await getContractData(missCfg.address);

      const res = await missCfg.sendNewStake(validator.wallet.getSender(),
                                             sConf.min_stake,
                                             validator.keys,
                                             electId);
      await assertNewStake(missCfg.address, res, ERROR.pool.WRONG_NOMINATOR_WC, stateBefore);
    });
    it('should not allow to send new stake without confirmation', async () => {
      const res = await pool.sendNewStake(validator.wallet.getSender(),
                                             sConf.min_stake,
                                             validator.keys,
                                             electId,
                                             { query_id: 0 });
      await assertNewStake(pool.address, res, ERROR.pool.WRONG_QUERY_ID, stateBefore);
    });
    it('should check for minimal elector fee', async () => {
      // For a fact it is excessive, so part of it goes into stake
      const minFee = toNano('1.2');
      const stateBefore = await getContractData(pool.address);
      const electId     = await announceElections();
      let   res = await pool.sendNewStake(validator.wallet.getSender(),
                                          sConf.min_stake,
                                          validator.keys,
                                          electId, {value: minFee - 1n});

      await assertNewStake(pool.address, res, ERROR.pool.INSUFFICIENT_ELECTOR_FEE, stateBefore);
      // Posiive fee verification
      res = await pool.sendNewStake(validator.wallet.getSender(),
                                    sConf.min_stake,
                                    validator.keys,
                                    electId, {value: minFee});

      await assertNewStake(pool.address, res, 0);
    });
    it('should retain fee for storage on balance', async () => {
      const stateBefore = await getContractData(pool.address);
      const electId     = await announceElections();
      const smc         = await blockchain.getContract(pool.address);

      let balanceLeft = smc.balance - minStorage;
      expect(balanceLeft).toBeGreaterThan(sConf.min_stake);

      let res = await pool.sendNewStake(validator.wallet.getSender(),
                                        balanceLeft + 1n,
                                        validator.keys,
                                        electId);
      await assertNewStake(pool.address, res, ERROR.pool.INSUFFICIENT_BALANCE, stateBefore);

      // smc.balance might decrease if storage phase triggered in first operation
      balanceLeft = smc.balance - minStorage;
      res = await pool.sendNewStake(validator.wallet.getSender(),
                                    balanceLeft,
                                    validator.keys,
                                    electId);
      await assertNewStake(pool.address, res, 0);
    });
    it('should reject malformed new_stake messages', async () => {
      const testPayload = async (payload: Cell) => {
        return await validator.wallet.send({
          to: pool.address,
          value: toNano('1.2'),
          body: payload,
          sendMode: SendMode.PAY_GAS_SEPARATELY
        });
      }
      const validStakeMsg = SingleNominator.newStakeMessage(sConf.min_stake,
                                                            pool.address,
                                                            validator.keys,
                                                            electId);
      expect(validStakeMsg.refs.length).toBe(1);
      const noSignature = beginCell().storeBits(validStakeMsg.bits).endCell();

      let res = await testPayload(noSignature);
      // Expect cell undeflow
      await assertNewStake(pool.address, res, 9, stateBefore);

      const bitLength = validStakeMsg.bits.length;
      const truncSize = getRandomInt(1, bitLength - 1);
      const truncated = beginCell()
                          .storeBits(validStakeMsg.bits.substring(0, bitLength - truncSize))
                          .storeRef(validStakeMsg.refs[0])
                        .endCell();
      res = await testPayload(truncated);
      await assertNewStake(pool.address, res, 9, stateBefore);

      const extraData = beginCell()
                          .storeSlice(validStakeMsg.beginParse())
                          .storeBit(false)
                        .endCell();
      res = await testPayload(extraData);
      await assertNewStake(pool.address, res, 9, stateBefore);

      res = await testPayload(validStakeMsg);
      // Make sure initial payload was valid
      await assertNewStake(pool.address, res, 0);
    });
    it('pool should be able to do full round', async () => {
      const res = await pool.sendNewStake(validator.wallet.getSender(),
                                          sConf.min_stake,
                                          validator.keys,
                                          electId);
      expect(res.transactions).toHaveTransaction({
        on: pool.address,
        from: elector.address,
        op: OP.elector.NEW_STAKE_OK,
        aborted: false
      });

      const stake = await elector.getParticipatesIn(validator.keys.publicKey);

      // Greater than because of leftowers from 1.2 TON fee
      expect(stake).toBeGreaterThanOrEqual(sConf.min_stake);
      // Election with us
      await runElections(true);
      await waitNextRound();
      // Elections without us
      await runElections(true);
      await waitNextRound();

      const vset = getVset(blockchain.config, 34);
      blockchain.now = vset.utime_unitl + eConf.stake_held_for + 1;

      // Wait for unfreeze
      let cnt = 3;
      while(cnt--) {
        await elector.sendTickTock("tock");
      }

      preRecover    = blockchain.snapshot();
      const recover = await pool.sendRecoverStake(validator.wallet.getSender());
      expect(recover.transactions).toHaveTransaction({
        on: pool.address,
        from: elector.address,
        op: OP.elector.RECOVER_STAKE_OK,
        value: (v) => v! > stake,
        aborted: false
      });
    });
    it('only validator should be able to recover stake', async () => {
      await blockchain.loadFrom(preRecover);

      const randomDude = await blockchain.treasury('random_dude');
      const dataBefore = await getContractData(pool.address);

      const testRecover = async (via: Sender, expect_recovery: boolean) => {
        const recover = await pool.sendRecoverStake(via);
        if(expect_recovery) {
          expect(recover.transactions).toHaveTransaction({
            on: pool.address,
            from: elector.address,
            op: OP.elector.RECOVER_STAKE_OK
          });
        }
        else {
          expect(recover.transactions).not.toHaveTransaction({
            on: elector.address,
            from: pool.address
          });
          expect(await getContractData(pool.address)).toEqualCell(dataBefore);
        }
        return recover;
      }

      await testRecover(randomDude.getSender(), false);
      await testRecover(owner.getSender(), false);
      await testRecover(validator.wallet.getSender(), true);
    });
  });
  describe.skip('In my view', () => {
    beforeEach(async () => await blockchain.loadFrom(initialState));

    it('should return change from new stake operation', async () => {
      const electId = await announceElections();
      const res = await pool.sendNewStake(validator.wallet.getSender(),
                                          sConf.min_stake,
                                          validator.keys,
                                          electId);
      const notifyTx = findTransactionRequired(res.transactions, {
        on: pool.address,
        from: elector.address,
        op: OP.elector.NEW_STAKE_OK,
        aborted: false
      });

      const computed = computedGeneric(notifyTx);
      const storage  = storageGeneric(notifyTx);
      const inMsg    = notifyTx.inMessage!;

      if(inMsg.info.type !== 'internal') {
        throw new Error("No way!");
      }

      expect(res.transactions).toHaveTransaction({
        on: validator.wallet.address,
        from: pool.address,
        value: inMsg.info.value.coins - computed.gasFees - msgConf.lumpPrice,
      });
    });
    it('should not withdraw if requested amount is not available', async () => {
      const msgValue    = toNano('0.1');
      const stateBefore = await getContractData(pool.address);
      const smc = await blockchain.getContract(pool.address);

      const res = await pool.sendWithdraw(owner.getSender(), smc.balance * 2n, msgValue);
      expect(res.transactions).not.toHaveTransaction({
        on: owner.address,
        from: pool.address,
        inMessageBounced: false,
      });
    });
  });
});


