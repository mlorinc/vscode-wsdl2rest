import * as fs from 'fs';
import * as path from 'path';

// start of package.json interfaces
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
// end of package.json interfaces

/**
 * Get package.json data
 * @returns interface with data required for ui-tests. For more data, cast it to `{key: string}: string` type
 */
export function getPackageData(): PackageData {
	if (packageData !== undefined) {
		return packageData;
	}

	packageData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), { encoding: 'utf8' }));
	return packageData;
}

let packageData: PackageData = undefined;
