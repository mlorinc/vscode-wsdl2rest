import { expect } from 'chai';
import { EditorView, ExtensionsViewItem } from 'vscode-extension-tester';
import { Marketplace, CommandPalette, DefaultWait } from 'vscode-uitests-tooling';
import { PackageData, getPackageData } from './package_data';

export function test() {
	describe('Marketplace extension test', function () {
		this.timeout(3500);
		let packageData: PackageData;
		let marketplace: Marketplace;
		let wsdl2restExtension: ExtensionsViewItem;

		before('Init tester and get package data', async function () {
			this.timeout(10000);
			packageData = getPackageData();
			marketplace = await Marketplace.open();
		});

		after('Clear workspace', async function () {
			await Promise.all([
				marketplace.close(),
				new EditorView().closeAllEditors()
			]);
		});

		it('Find extension', async function () {
			this.timeout(10000);
			wsdl2restExtension = await marketplace.findExtension(`@installed ${packageData.displayName}`);
			expect(wsdl2restExtension).not.to.be.undefined;
		});

		it('Extension is installed', async function () {
			expect(await wsdl2restExtension.isInstalled()).to.be.true;
		});

		it('Extensions has expected title', async function () {
			expect(await wsdl2restExtension.getTitle()).to.equal(packageData.displayName);
		});

		it('Owner of the extension is Red Hat', async function () {
			expect(await wsdl2restExtension.getAuthor()).to.equal('Red Hat');
		});

		it('The extension has correct description', async function () {
			expect(await wsdl2restExtension.getDescription()).to.equal(packageData.description);
		});

		it('Registered all commands', async function () {
			const cmd = await CommandPalette.open();
			await cmd.setText('>wsdl2rest');
			await DefaultWait.sleep(750);
			const quickPicks = await cmd.getQuickPicks();
			const suggestions = await Promise.all(quickPicks.map(q => q.getText()));
			const commands = packageData.contributes.commands.map(x => x.title);

			expect(suggestions).to.have.all.members(commands);
			await cmd.cancel();
		});
	});
}
