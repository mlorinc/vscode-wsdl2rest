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

	packageData = JSON.parse(fs.readFileSync(path.join(PROJECT_PATH, 'package.json'), { encoding: 'utf8' }));
	return packageData;
}

function initProjectPath(): string | null {
	let lastProjectPath: string = null;
	let projectPath: string = __dirname;

	// check if we are in root of filesystem
	while (projectPath !== lastProjectPath) {
		const files = fs.readdirSync(projectPath);

		for (const file of files) {
			if (file == 'package.json') {
				// we found package.json => we found project path
				return projectPath;
			}
		}

		projectPath =  path.resolve(projectPath, '..');
	}

	return null;
}

let packageData: PackageData = undefined;

// export as constant
const PROJECT_PATH = initProjectPath();

export { PROJECT_PATH };
