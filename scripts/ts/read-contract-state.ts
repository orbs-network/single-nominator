import { Address, TonClient, fromNano, Cell } from "ton";
import {config, client} from "../../deploy/config";

async function readContractState(nominatorAddr: string) {
  
  let state = await client.getContractState(Address.parse(nominatorAddr));
  console.log(state);
  console.log(fromNano(state.balance));

  const cell = Cell.fromBoc(state.data!)[0];
  let slice = cell.beginParse()
  let owner = slice.readAddress();
  let validator = slice.readAddress();
  console.log({
    owner: owner?.toFriendly(),
    validator: validator?.toFriendly(),
  });
}

(async () => {
  await readContractState(process.argv[2]);
})();
