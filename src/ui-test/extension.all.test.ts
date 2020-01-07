import * as marketplaceTest from './marketplace.test';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as extensionTest from './extension.test';
import * as webserver from '../test/app_soap';
import { expect } from 'chai';
import { Project } from 'vscode-uitests-tooling';
import { VSBrowser, WebDriver } from 'vscode-extension-tester';

describe('All tests', function () {
	marketplaceTest.test();

	describe('Extension tests', function() {
		let browser: VSBrowser;
		let driver: WebDriver;
		let workspace: Project;

		before('Setup environment', async function() {
			this.timeout(23000);
			browser = VSBrowser.instance;
			driver = browser.driver;

			workspace = await prepareWorkspace();
			webserver.startWebService();
		});

		after('Clear environment', async function() {
			await clearWorkspace(workspace);
			webserver.stopWebService();
		});

		for (const f of walk(path.join(process.cwd(), 'src/ui-test/test-data'))) {
			assert(f.endsWith('.json'), `${f} is not json file`);
			const fileContent = fs.readFileSync(f, { encoding: 'utf8' });
			extensionTest.test(JSON.parse(fileContent));
		}
	});

});

function* walk(dir: string): Iterable<string> {
	const stack = [dir];

	while (stack.length > 0) {
		const file = stack.pop();
		const stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			stack.push(...fs.readdirSync(file).map(f => path.join(file, f)));
		} else {
			yield file;
		}
	}
}

async function prepareWorkspace(): Promise<Project> {
	const project = new Project(extensionTest.WORKSPACE_PATH);
	expect(project.exists).to.be.false;
	project.create();
	expect(project.exists).to.be.true;
	await project.open();
	return project;
}


async function clearWorkspace(workspace: Project): Promise<void> {
	await workspace.close();
	await workspace.delete();
}
