import { compileFuncToB64 } from "./utils";
import { writeFileSync } from "fs";
import { execSync } from "child_process";

function main() {
  let getCommitHash = execSync(`git log --format="%H" -n 1`).toString().trim();
  const restrictedWallet = compileFuncToB64(["contracts/config.fc", "contracts/imports/stdlib.fc", "contracts/imports/nonstdlib.fc", "contracts/restricted.fc"]);
  writeFileSync(`./build/restricted-elector.json`, `{ "hex":"${restrictedWallet}", "commitHash":"${getCommitHash}" }`);
}

main();
