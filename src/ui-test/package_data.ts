import * as fs from 'fs';
import * as path from 'path';

export interface Command {
	command: string;
	title: string;
}

export interface Contributes {
	commands: Array<Command>;
}

export interface PackageData {
	displayName?: string;
	description?: string;
	contributes?: Contributes;
}

export function getPackageData(): PackageData {
	if (packageData !== undefined) {
		return packageData;
	}

	packageData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), { encoding: 'utf8' }));
	return packageData;
}

let packageData: PackageData = undefined;
