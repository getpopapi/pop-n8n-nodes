import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PopApi implements ICredentialType {
	name = 'popApi';

	displayName = 'POP API';

	icon = 'file:../nodes/Pop/pop-light.svg' as const;

	documentationUrl = 'https://github.com/getpopapi/n8n-nodes-pop#authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'License Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'POP Cloud API license key. Sent as the X-API-Key header on every request.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://popapi.io/wp-json/api/v2',
			url: '/account-profile',
		},
	};
}
