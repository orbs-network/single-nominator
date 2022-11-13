import {TonClient, Address} from "ton";
require('dotenv').config();

if (!process.env.OWNER_ADDRESS) throw ('Please set OWNER_ADDRESS environment variable');
if (!process.env.VALIDATOR_ADDRESS) throw ('Please set VALIDATOR_ADDRESS environment variable');

export const config = {
	owner: Address.parse(process.env.OWNER_ADDRESS),
	validator: Address.parse(process.env.VALIDATOR_ADDRESS)
};

export const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC", apiKey: process.env.TON_API_KEY});
