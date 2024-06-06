import { CompilerConfig } from '@ton/blueprint';

export const compile:CompilerConfig = {
	targets: ['contracts/imports/stdlib.fc','contracts/test/elector-code.fc']
};
