import { execSync } from "child_process";
import { mnemonicNew, mnemonicToWalletKey, KeyPair } from "ton-crypto";
import fs from "fs";

export function compileFuncToB64(funcFiles: string[]): string {
    const funcPath = process.env.FUNC_PATH || "func";
    try {
        execSync(`${funcPath} -o build/tmp.fif  -SPA ${funcFiles.join(" ")}`);
    } catch (e: any) {
        if (e.message.indexOf("error: `#include` is not a type identifier") > -1) {
            console.log(`
============================================================================================================
Please update your func compiler to support the latest func features
to set custom path to your func compiler please set  the env variable "export FUNC_PATH=/usr/local/bin/func"
============================================================================================================
`);
            process.exit(1);
        } else {
            console.log(e.message);
        }
    }

    const stdOut = execSync(`/usr/local/bin/fift -s src/print-hex.fif`).toString();
    return stdOut.trim();
}

export async function initDeployKey() {
    const deployConfigJson = `./build/deploy.config.json`;
    const deployerWalletType = "org.ton.wallets.v3.r2";
    let deployerMnemonic;
    if (!fs.existsSync(deployConfigJson)) {
        //  console.log(`\n* Config file '${deployConfigJson}' not found, creating a new wallet for deploy..`);
        deployerMnemonic = (await mnemonicNew(24)).join(" ");
        const deployWalletJsonContent = {
            created: new Date().toISOString(),
            deployerWalletType,
            deployerMnemonic,
        };
        fs.writeFileSync(deployConfigJson, JSON.stringify(deployWalletJsonContent, null, 2));
        //console.log(` - Created new wallet in '${deployConfigJson}' - keep this file secret!`);
    } else {
        //console.log(`\n* Config file '${deployConfigJson}' found and will be used for deployment!`);
        const deployConfigJsonContentRaw = fs.readFileSync(deployConfigJson, "utf-8");
        const deployConfigJsonContent = JSON.parse(deployConfigJsonContentRaw);
        if (!deployConfigJsonContent.deployerMnemonic) {
            console.log(` - ERROR: '${deployConfigJson}' does not have the key 'deployerMnemonic'`);
            process.exit(1);
        }
        deployerMnemonic = deployConfigJsonContent.deployerMnemonic;
    }
    return mnemonicToWalletKey(deployerMnemonic.split(" "));
}

export function filterLogs(logs: string) {
    const arr = logs.split("\n");
    //    console.log(arr.length);

    let filtered = arr.filter((it) => {
        return it.indexOf("#DEBUG#") !== -1 || it.indexOf("error") !== -1;
    });
    const beautified = filtered.map((it, i) => {
        const tabIndex = it.indexOf("\t");
        return `${i + 1}. ${it.substring(tabIndex + 1, it.length)}`;
    });

    return beautified;
}
