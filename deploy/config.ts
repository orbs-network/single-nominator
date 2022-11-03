import {TonClient, Address} from "ton";

export const config = {

	owner: Address.parse('EQBJbS35Ec-efHt7bOxPl3Vitw7CXLUBU_CT0r0NnVnOtpGy'),
	validator: Address.parse('Ef9SGIB3Pix1RxyAGR9jQa5sA4Ug5Ljw3QAJsdF7euE1EpFI')
};


export const client = new TonClient({ endpoint: process.env.TON_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC", apiKey: "3ebe42d62396ff96725e0de9e71cae2916c1b690d3ffc8a80ecd9af4e8fef6f2"});
