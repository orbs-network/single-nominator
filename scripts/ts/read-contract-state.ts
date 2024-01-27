import { Address, fromNano, Cell } from "@ton/ton";
import { client } from "../../deploy/config";

async function readContractState(nominatorAddr: string) {
  let state = await client.getContractState(Address.parse(nominatorAddr));
  console.log(state);
  console.log(fromNano(state.balance));

  const cell = Cell.fromBoc(state.data!)[0];
  let slice = cell.beginParse();
  let owner = slice.loadAddress();
  let validator = slice.loadAddress();
  console.log({
    owner: owner?.toString(),
    validator: validator?.toString(),
  });
}

(async () => {
  await readContractState(process.argv[2]);
})();
