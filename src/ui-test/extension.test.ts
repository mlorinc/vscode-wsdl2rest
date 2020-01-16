import { expect } from 'chai';
import { VSBrowser, WebDriver, until, By, Workbench } from 'vscode-extension-tester';
import { Maven, CommandPalette, Dialog, Input, OutputViewExt, LogAnalyzer, NotificationWait, DefaultWait, TimeoutPromise } from 'vscode-uitests-tooling';
import { PackageData, getPackageData, Command, PROJECT_PATH } from './package_data';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as webServer from '../test/app_soap'; 

type Runtime = 'spring' | 'blueprint';
type GenerationType = 'url' | 'file';

const mavenGoals = {
	spring: 'exec:java',
	blueprint: 'camel:run'
};

export interface TestArguments {
	camelVersion: string;
	framework: Runtime;
	type: GenerationType;
}

interface RuntimeOutput {
	totalRoutes: string;
	startedRoutes: string;
	camelVersion: string;
}

const RUNTIME_FOLDER = path.join(PROJECT_PATH, 'src', 'ui-test', 'runtimes');
const WSDL_FILE = path.join(PROJECT_PATH, 'src', 'test', 'address.wsdl');
const WSDL_URL = webServer.getWSDLURL();
export const WORKSPACE_PATH = path.join(PROJECT_PATH, '.ui-testing');

export function test(args: TestArguments) {
	describe(`Extension test[${detailsString(args)}]`, function () {
		let browser: VSBrowser;
		let driver: WebDriver;
		let packageData: PackageData = getPackageData();

		const expectedFiles = new Set(getExpectedFileList(args).map(f => path.join(WORKSPACE_PATH, f)));
		let fileGenerationPromise: Promise<void> = null;
		let watcher: chokidar.FSWatcher = null;

		before('Project setup', async function () {
			browser = VSBrowser.instance;
			driver = browser.driver;
			fsExtra.copySync(path.join(RUNTIME_FOLDER, args.framework), WORKSPACE_PATH);

			fileGenerationPromise = new Promise(resolve => {
				watcher = chokidar.watch(WORKSPACE_PATH, {
					persistent: true,
					usePolling: false,
					ignorePermissionErrors: false
				});

				watcher.on('add', path => {
					if (expectedFiles.has(path)) {
						expectedFiles.delete(path);
						if (expectedFiles.size == 0) {
							resolve();
						}
					}
				});
			}).then(() => {
				watcher.close();
				watcher = null;
			});
		});

		after('Project cleanup', async function () {
			if (watcher !== null) {
				watcher.close();
			}
			for (const f of fs.readdirSync(WORKSPACE_PATH)) {
				fsExtra.removeSync(path.join(WORKSPACE_PATH, f));
			}
		});

		const command: Command = findCommand(args, packageData);

		it(`Execute command: ${command.command}`, async function () {
			this.timeout(6000);
			const cmd = await CommandPalette.open();
			await cmd.executeCommand(command.title);
		});

		it(`Open wsdl file [${args.type}]`, async function () {
			this.timeout(20000);
			switch (args.type) {
				case 'url':
					const input = await getInput(driver);
					input.test({
						placeholder: 'Provide the URL for the WSDL file',
						message: 'WSDL URL (Press \'Enter\' to confirm or \'Escape\' to cancel)'
					});

					await input.setText(WSDL_URL);
					await input.confirm();
					break;
				case 'file':
					await Dialog.confirm(WSDL_FILE);
					break;
			}
		});

		it(`Select '${args.framework}' option`, async function () {
			const input = await getInput(driver);

			await input.test({
				placeholder: 'Specify which DSL to generate the Camel configuration for',
				quickPicks: ['Spring', 'Blueprint']
			});

			await input.setText(args.framework);
			await input.confirm();
		});

		it(`Confirm output directory`, async function () {
			const input = await getInput(driver);

			await input.test({
				placeholder: 'Enter the output directory for generated artifacts',
				message: 'Output Directory (Press \'Enter\' to confirm or \'Escape\' to cancel)',
				text: 'src/main/java'
			});

			await input.confirm();
		});

		it('Confirm JAX-WS endpoint', async function () {
			const input = await getInput(driver);

			await input.test({
				placeholder: 'Enter the address for the running jaxws endpoint (defaults to http://localhost:8080/somepath)',
				message: 'JAXWS Endpoint (Press \'Enter\' to confirm or \'Escape\' to cancel)'
			});

			await input.confirm();
		});

		it('Confirm JAX-RS endpoint', async function () {
			const input = await getInput(driver);

			await input.test({
				placeholder: 'Enter the address for the jaxrs endpoint (defaults to http://localhost:8081/jaxrs)',
				message: 'JAXRS Endpoint (Press \'Enter\' to confirm or \'Escape\' to cancel)'
			});

			await input.setText('http://localhost:8000/jaxrs');
			await input.confirm();
		});

		it('Convert wsdl project', async function () {
			this.timeout(15000);
			const output = await OutputViewExt.open();
			const hasText = await output.waitUntilContainsText('Process finished. Return code 0.', 13500);
			expect(hasText, 'Output did not finish with code 0 or timed out.\n Error: ' + await output.getText()).to.be.true;
		});

		describe('Generated all files', function () {
			it('Created all required files', async function () {
				this.timeout(10000);
				new TimeoutPromise(async (resolve, reject) => {
					await fileGenerationPromise;
					resolve();
				}, 8000).catch(e => {
					console.error(e);
					expect.fail(
						'Test failed to generate:\n' +
						Array(expectedFiles).map(file => `\r${file}`).join('\n')
					);
				});
			});

			it('Show notifications', async function () {
				const notifications = await new Workbench().getNotifications();
				let notification = notifications.find(async n => await n.getMessage() == `Created ${getCamelContextPath(args)}`);

				if (notification === undefined) {
					expect.fail('Did not find notification');
				}

				notification = notifications.find(async n => await n.getMessage() == 'Created CXF artifacts for specified WSDL at src/main');
			});
		});

		describe('Test generated project', function () {
			let maven: Maven;

			before('Install maven project', async function () {
				this.timeout(0);
				const exitCode = await prepareMavenProject(args.framework, args.camelVersion);
				expect(exitCode).to.equal(0);
			});

			after('Make sure maven is not running', async function () {
				if (maven.isRunning) {
					await maven.exit(true);
				}
			});

			it('Run projects', async function () {
				this.timeout(30000);
				maven = executeProject(args.framework, args.camelVersion);

				const data = await analyzeProject(maven);
				const expectedRoutesCount = getExpectedNumberOfRoutes(args);

				expect(parseInt(data.startedRoutes), "All routes were not started").to.equal(expectedRoutesCount);
				expect(parseInt(data.totalRoutes), "Number of routes does not match").to.equal(expectedRoutesCount);
				expect(data.camelVersion, "Camel version mismatch").to.equal(args.camelVersion);
			});
		});

	});
}

function findCommand(args: TestArguments, packageData: PackageData): Command {
	switch (args.type) {
		case 'url':
			return packageData.contributes.commands.find(x => x.command.endsWith('url'));
		case 'file':
			return packageData.contributes.commands.find(x => x.command.endsWith('local'));
	}
}

function detailsString(args: TestArguments): string {
	let segments: string[] = [];

	switch (args.type) {
		case 'url':
			segments.push(`url = ${WSDL_URL}`);
		case 'file':
			segments.push(`file = ${WSDL_FILE}`);
	}
	segments.push(args.framework);
	segments.push(`camel = ${args.camelVersion}`);
	return segments.join(', ');
}

async function prepareMavenProject(runtime: Runtime, camelVersion: string): Promise<number> {
	const maven = new Maven({
		args: ['clean', 'install'],
		properties: {
			'camel.version': camelVersion
		},
		cwd: WORKSPACE_PATH
	});
	maven.spawn();

	// show progress of install
	maven.stdoutLineReader.on('line', console.log);
	
	return maven.wait();
}

function executeProject(runtime: Runtime, camelVersion: string): Maven {
	const maven = new Maven({
		args: [mavenGoals[runtime]],
		properties: {
			'camel.version': camelVersion
		},
		cwd: WORKSPACE_PATH
	});

	maven.spawn();
	return maven;
}

async function analyzeProject(maven: Maven): Promise<RuntimeOutput> {
	const analyzer = new LogAnalyzer(maven.stdoutLineReader);

	analyzer.whenMatchesThenCaptureData(/.*Total (?<totalRoutes>\d+) routes, of which (?<startedRoutes>\d+) are started/);
	analyzer.whenMatchesThenCaptureData(
		/.*Apache Camel (?<camelVersion>\d+\.\d+\.\d+(|\.[a-zA-Z0-9-_]+)) \(CamelContext: .+\) started in.*/
	);
	analyzer.startOrderedParsing();

	const analyzerResult = await analyzer.wait() as RuntimeOutput;
	return analyzerResult;
}

function getExpectedNumberOfRoutes(args: TestArguments): number {
	switch (args.type) {
		case 'file':
			return 10;
		case 'url':
			return 2;
	}
}

function getCamelContextPath(args: TestArguments): string {
	switch (args.framework) {
		case 'spring':
			return 'src/main/resources/META-INF/spring/camel-context.xml';
		case 'blueprint':
			return 'src/main/resources/OSGI-INF/blueprint/blueprint.xml';
	}
}

function getSourceRootOfGeneratedFiles(args: TestArguments): string {
	switch (args.type) {
		case 'file':
			return '/src/main/java/org/jboss/fuse/wsdl2rest/test/doclit';

		case 'url':
			return 'src/main/java/org/helloworld/test/rpclit';
	}
}

function getExpectedFileList(args: TestArguments): string[] {
	let files = [
		'wsdl2rest.readme.md',
		'config/logging.properties',
		getCamelContextPath(args)
	];

	const sourceRoot: string = getSourceRootOfGeneratedFiles(args);
	switch (args.type) {
		case 'file':
			files.push(
				`${sourceRoot}/AddAddress.java`,
				`${sourceRoot}/AddAddressResponse.java`,
				`${sourceRoot}/Address.java`,
				`${sourceRoot}/AddressService.java`,
				`${sourceRoot}/DelAddress.java`,
				`${sourceRoot}/DelAddressResponse.java`,
				`${sourceRoot}/GetAddress.java`,
				`${sourceRoot}/GetAddressResponse.java`,
				`${sourceRoot}/Item.java`,
				`${sourceRoot}/ListAddresses.java`,
				`${sourceRoot}/ListAddressesResponse.java`,
				`${sourceRoot}/ObjectFactory.java`,
				`${sourceRoot}/package-info.java`,
				`${sourceRoot}/UpdAddress.java`,
				`${sourceRoot}/UpdAddressResponse.java`,
			);
			break;
		case 'url':
			files.push(
				`${sourceRoot}/HelloPortType.java`,
				`${sourceRoot}/HelloService.java`,
			);
			break;
	}
	return files;
}

async function getInput(driver: WebDriver): Promise<Input> {
	await driver.wait(until.elementLocated(By.className('quick-input-widget')));
	return Input.getInstance();
} 
