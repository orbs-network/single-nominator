import {TonClient, Address} from "ton";

export const config = {

	owner: Address.parse('EQD87ZfKcR52rfY_3VQZ-4SEG8YJAYLo7HEr3WwTzU8d2pb2'),
	validator: Address.parse('Ef8fP5esY3kEqrANekDXP0WcwhG6Ig5ceqNmYBFt9fn16JDk')
};


export const client = new TonClient({ endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: "0b9c288987a40a10ac53c277fe276fd350d217d0a97858a093c796a5b09f39f6"});
// export const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://sandbox.tonhubapi.com/jsonRPC"});
