/**
 * POP Node — main entry point
 *
 * This is the primary node class registered with n8n. It defines the
 * node's metadata (display name, icon, credentials, etc.) and its
 * available properties (resource + operation selectors plus all
 * operation-specific fields).
 *
 * Execution is delegated entirely to the router, which dispatches
 * each input item to the correct operation handler based on the
 * selected resource + operation combination.
 *
 * Architecture:
 *   Pop.node.ts → router.ts → invoices/<operation>.ts → utils/request.ts
 */
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { router } from './router';
import * as invoices from './invoices';
import * as vies from './vies';

export class Pop implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'POP',
		name: 'pop',
		icon: { light: 'file:pop-light.svg', dark: 'file:pop-dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Interact with POP Cloud API (v2) for e-invoicing (SdI and Peppol)',
		defaults: {
			name: 'POP',
		},
		// Single main input and output — standard for action nodes
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// Optional: when configured, the credential's license key is sent as
		// the X-API-Key header on every request. Per-operation licenseKey
		// fields (form mode) override the credential when set.
		credentials: [
			{
				name: 'popApi',
				required: false,
			},
		],
		// Allow this node to be used as an AI tool in n8n Agent workflows
		usableAsTool: true,
		// Merge all resource/operation properties from each resource module
		properties: [...invoices.properties, ...vies.properties],
	};

	/**
	 * Main execution method called by n8n for each workflow run.
	 * Delegates to the router which handles per-item dispatching and continueOnFail.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
