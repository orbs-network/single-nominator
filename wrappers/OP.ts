export abstract class OP {
    static pool = {
        WITHDRAW : 0x1000,
        CHANGE_VALIDATOR_ADDRESS : 0x1001,
        SEND_RAW_MSG : 0x7702,
        UPGRADE : 0x9903
    }
    static elector = {
        NEW_STAKE : 0x4e73744b,
        NEW_STAKE_SIGNED : 0x654c5074,
        NEW_STAKE_OK  : 0xf374484c,
        NEW_STAKE_FAILED : 0xee6f454c,
        RECOVER_STAKE : 0x47657424,
        RECOVER_STAKE_OK : 0xf96f7324,
        RECOVER_STAKE_FAILED : 0xfffffffe
    }
}
