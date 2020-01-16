import * as path from 'path';

import { runTests } from 'vscode-test';
import { PROJECT_PATH } from '../ui-test/package_data';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = PROJECT_PATH;

		// The path to the extension test runner script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './');

		// Download VS Code, unzip it and run the integration test
		await runTests({ extensionDevelopmentPath, extensionTestsPath });
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
