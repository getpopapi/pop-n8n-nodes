/**
 * Invoice Form Fields — shared field definitions for create operations
 *
 * This module provides a factory function that generates all the n8n
 * UI properties (form fields) needed by both the SdI and Peppol
 * create-invoice operations.
 *
 * Using a factory function allows the fields to be parameterized by
 * operation name, enabling conditional differences between SdI and Peppol:
 * - Customer type options (Peppol: Company/Freelance only; SdI: +Private)
 * - SDI Type field (SdI only — Peppol doesn't use codice destinatario)
 * - SDI Code in transmitter data (SdI only)
 *
 * Field sections:
 * A. Required top-level fields (license key, invoice ID, filename, etc.)
 * B. Transmitter Data (who sends the invoice to SdI/Peppol)
 * C. Sender / Lender (the invoicing entity)
 * D. Recipient / Client (who receives the invoice)
 * E. Invoice Details (document type, currency, prefix/suffix)
 * F. Order Items (line items with prices, quantities, VAT)
 * G. Payment Data (method, terms, bank details for MP05)
 * H. Additional Options (advanced/optional fields)
 */
import type { INodeProperties } from 'n8n-workflow';

/** The invoice creation/sync operations that share these form fields */
type InvoiceOperation = 'createSdiInvoiceXml' | 'createPeppolInvoiceUbl' | 'createKsefInvoiceXml' | 'createZugferdInvoice' | 'syncZohoDocument';

/**
 * Factory that returns the full set of form-mode INodeProperties
 * for a given invoice operation.
 *
 * @param operation - Which create operation these fields belong to.
 *   Controls displayOptions and conditional field inclusion.
 * @returns Array of INodeProperties to spread into the operation's properties
 */
export function makeInvoiceFormFields(operation: InvoiceOperation): INodeProperties[] {
	const showForm = {
		show: {
			resource: ['invoices'] as string[],
			operation: [operation] as string[],
			inputMode: ['form'] as string[],
		},
	};

	return [
		// ── A. Required top‑level fields ────────────────────────────
		{
			displayName: 'License Key',
			name: 'licenseKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			displayOptions: showForm,
			description:
				'POP license key. Sent as the X-API-Key header and as license_key in the body for backwards compatibility. Leave empty to use the configured POP API credential.',
		},
		{
			displayName: 'Target Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Default', value: '' },
				{ name: 'Live', value: 'live' },
				{ name: 'Sandbox', value: 'sandbox' },
			],
			default: '',
			displayOptions: showForm,
			description: 'Target environment. Sandbox does not consume credits. Leave empty to use the API default.',
		},
		{
			displayName: 'Invoice / Order ID',
			name: 'invoiceId',
			type: 'number',
			required: true,
			default: 0,
			displayOptions: showForm,
			description: 'Numeric ID of the invoice or order',
		},
		{
			displayName: 'Filename',
			name: 'filename',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'IT99900088876_00009',
			displayOptions: showForm,
			description: 'FatturaPA / Peppol filename (e.g. IT99900088876_00009)',
		},
		...(operation === 'createPeppolInvoiceUbl'
			? [
					{
						displayName: 'Customer Type',
						name: 'customerType',
						type: 'options' as const,
						required: true,
						default: 'company',
						options: [
							{ name: 'Company', value: 'company' },
							{ name: 'Freelance', value: 'freelance' },
						],
						displayOptions: showForm,
						description: 'Type of the recipient customer',
					},
				]
			: [
					{
						displayName: 'Customer Type',
						name: 'customerType',
						type: 'options' as const,
						required: true,
						default: 'private',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Company', value: 'company' },
							{ name: 'Freelance', value: 'freelance' },
						],
						displayOptions: showForm,
						description: 'Type of the recipient customer',
					},
				]),
		...(operation === 'createSdiInvoiceXml'
			? [
					{
						displayName: 'SDI Type (Codice Destinatario)',
						name: 'sdiType',
						type: 'string' as const,
						required: true,
						default: '',
						placeholder: 'ABC1234',
						displayOptions: {
							show: {
								resource: ['invoices'],
								operation: [operation],
								inputMode: ['form'],
							},
						},
						description:
							'SdI destination code. For private customers without a 7-char code, the API defaults to 0000000. For foreign clients (country != IT) the API forces XXXXXXX.',
					},
				]
			: []),
		{
			displayName: 'Invoice Number',
			name: 'invoiceNumber',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'WEB9/2025',
			displayOptions: showForm,
			description: 'Full invoice number (e.g. WEB9/2025)',
		},
		{
			displayName: 'Invoice Date',
			name: 'invoiceDate',
			type: 'string',
			required: true,
			default: '',
			placeholder: '2025-01-31',
			displayOptions: showForm,
			description: 'Invoice date in YYYY-MM-DD format',
		},
		{
			displayName: 'Total Document Amount',
			name: 'totalAmount',
			type: 'string',
			required: true,
			default: '',
			placeholder: '16.38',
			displayOptions: showForm,
			description: 'Total amount of the document including taxes',
		},

		// ── B. Transmitter Data ─────────────────────────────────────
		{
			displayName: 'Transmitter Data',
			name: 'transmitterData',
			type: 'fixedCollection',
			placeholder: 'Set Transmitter Fields',
			default: {},
			displayOptions: showForm,
			description: 'Data identifying the entity that transmits the invoice to SdI / Peppol',
			options: [
				{
					displayName: 'Transmitter',
					name: 'transmitterValues',
					values: [
						{
							displayName: 'Country',
							name: 'transmitterCountryId',
							type: 'string',
							default: 'IT',
							description: 'ISO country code of the transmitter (e.g. IT)',
						},
						{
							displayName: 'Email',
							name: 'transmitterEmail',
							type: 'string',
							default: '',
							description: 'Transmitter contact email address',
						},
						{
							displayName: 'ID Code',
							name: 'transmitterIdCode',
							type: 'string',
							default: '',
							placeholder: 'IT99900088876',
							description: 'Transmitter identification code (e.g. IT	+	VAT number)',
						},
						{
							displayName: 'Phone',
							name: 'transmitterPhone',
							type: 'string',
							default: '',
							description: 'Transmitter contact phone number',
						},
						...(operation === 'createSdiInvoiceXml'
							? [
									{
										displayName: 'Progressive',
										name: 'progressive',
										type: 'string' as const,
										default: '',
										description: 'Progressive identifier for the transmission',
									},
									{
										displayName: 'Recipient PEC',
										name: 'recipientPec',
										type: 'string' as const,
										default: '',
										description: 'PEC (certified email) of the recipient',
									},
								]
							: []),
						...(operation === 'createSdiInvoiceXml'
							? [
									{
										displayName: 'SDI Code',
										name: 'sdiCode',
										type: 'string' as const,
										default: '0000000',
										description: 'Codice destinatario SdI (7 characters)',
									},
								]
							: []),
						{
							displayName: 'Transmitter Format',
							name: 'transmitterFormat',
							type: 'options',
							options: [
								{
									name: 'FPR12 (Private)',
									value: 'FPR12',
								},
								{
									name: 'FPA12 (Public Administration)',
									value: 'FPA12',
								},
							],
							default: 'FPR12',
							description: 'FatturaPA format version',
						},
					],
				},
			],
		},

		// ── C. Sender (Transfer Lender) ─────────────────────────────
		{
			displayName: 'Sender (Lender)',
			name: 'senderData',
			type: 'fixedCollection',
			placeholder: 'Set Sender Fields',
			default: {},
			displayOptions: showForm,
			description: 'Information about the invoice sender / lender',
			options: [
				{
					displayName: 'Sender',
					name: 'senderValues',
					values: [
						{
							displayName: 'Address',
							name: 'senderAddress',
							type: 'string',
							default: '',
							placeholder: 'Via Roma, 123',
							description: 'Street address of the sender',
						},
						{
							displayName: 'City',
							name: 'senderCity',
							type: 'string',
							default: '',
							description: 'City name',
						},
						{
							displayName: 'Company Name',
							name: 'senderCompanyName',
							type: 'string',
							default: '',
							description: 'Company or business name of the sender',
						},
						{
							displayName: 'Country',
							name: 'senderCountry',
							type: 'string',
							default: 'IT',
							description: 'ISO country code of the sender address',
						},
						{
							displayName: 'Email',
							name: 'senderEmail',
							type: 'string',
							default: '',
							description: 'Contact email address',
						},
						{
							displayName: 'Phone',
							name: 'senderPhone',
							type: 'string',
							default: '',
							description: 'Contact phone number',
						},
						{
							displayName: 'Province',
							name: 'senderProvinceId',
							type: 'string',
							default: '',
							placeholder: 'CT',
							description: 'Province abbreviation (e.g. CT, MI, RM)',
						},
						...(operation === 'createSdiInvoiceXml'
							? [
									{
										displayName: 'Tax Regime',
										name: 'senderTaxRegime',
										type: 'options' as const,
										options: [
											{ name: 'RF01 - Ordinary', value: 'RF01' },
											{ name: 'RF02 - Small Taxpayers (art.1, c.96-117, L. 244/07)', value: 'RF02' },
											{ name: 'RF03 - New Productive Initiatives (art.13, L. 388/00)', value: 'RF03' },
											{
												name: 'RF04 - Agriculture and Related Activities and Fishing (artt.34 and 34-Bis, DPR 633/72)',
												value: 'RF04',
											},
											{
												name: 'RF05 - Sale of Salts and Tobacco (art.74, c.1, DPR 633/72)',
												value: 'RF05',
											},
											{ name: 'RF06 - Matchstick Trade (art.74, c.1, DPR 633/72)', value: 'RF06' },
											{ name: 'RF07 - Publishing (art.74, c.1, DPR 633/72)', value: 'RF07' },
											{
												name: 'RF08 - Management of Public Telephone Services (art.74, c.1, DPR 633/72)',
												value: 'RF08',
											},
											{
												name: 'RF09 - Resale of Public Transportation and Parking Documents (art.74, c.1, DPR 633/72)',
												value: 'RF09',
											},
											{
												name: 'RF10 - Entertainment, Games, and Other Activities (art.74, c.6, DPR 633/72)',
												value: 'RF10',
											},
											{
												name: 'RF11 - Travel and Tourism Agencies (art.74-Ter, DPR 633/72)',
												value: 'RF11',
											},
											{ name: 'RF12 - Agritourism (art.5, c.2, L. 413/91)', value: 'RF12' },
											{ name: 'RF13 - Door-to-Door Sales (art.25-Bis, c.6, DPR 600/73)', value: 'RF13' },
											{
												name: 'RF14 - Resale of Used Goods, Art Objects, Antiques, or Collectibles (art.36, DL 41/95)',
												value: 'RF14',
											},
											{ name: 'RF15 - Art Auction Sales Agencies (art.40-Bis, DL 41/95)', value: 'RF15' },
											{ name: 'RF16 - Cash VAT for P.A. (art.6, c.5, DPR 633/72)', value: 'RF16' },
											{ name: 'RF17 - Cash VAT (Art. 32-Bis, DL 83/2012)', value: 'RF17' },
											{ name: 'RF18 - Other', value: 'RF18' },
											{ name: 'RF19 - Flat-Rate Regime (art.1, c.54-89, L. 190/2014)', value: 'RF19' },
										],
										default: 'RF01',
										description: 'Italian tax regime code (Regime Fiscale)',
									},
								]
							: []),
						{
							displayName: 'VAT Country',
							name: 'senderCountryId',
							type: 'string',
							default: 'IT',
							description: 'ISO country code for VAT identification',
						},
						{
							displayName: 'VAT ID Code',
							name: 'senderIdCode',
							type: 'string',
							default: '',
							placeholder: operation === 'createPeppolInvoiceUbl' ? 'BE0123456789' : 'IT99900088876',
							description: 'Full VAT identification code (e.g. IT	+	VAT number)',
						},
						{
							displayName: 'ZIP Code',
							name: 'senderZipCode',
							type: 'string',
							default: '',
							placeholder: operation === 'createPeppolInvoiceUbl' ? '1000' : '95100',
							description: 'Postal	/	ZIP code',
						},
					],
				},
			],
		},

		// ── D. Recipient (Transferee Client) ────────────────────────
		{
			displayName: 'Recipient (Client)',
			name: 'recipientData',
			type: 'fixedCollection',
			placeholder: 'Set Recipient Fields',
			default: {},
			displayOptions: showForm,
			description: 'Information about the invoice recipient / client',
			options: [
				{
					displayName: 'Recipient',
					name: 'recipientValues',
					values: [
						{
							displayName: 'Address',
							name: 'recipientAddress',
							type: 'string',
							default: '',
							placeholder: 'Via Roma 123',
							description: 'Street address of the recipient',
						},
						{
							displayName: 'City',
							name: 'recipientCity',
							type: 'string',
							default: '',
							description: 'City name',
						},
						{
							displayName: 'Company Name',
							name: 'recipientCompanyName',
							type: 'string',
							default: '',
							description: 'Company name (leave empty for individuals)',
						},
						{
							displayName: 'Country',
							name: 'recipientCountry',
							type: 'string',
							default: 'IT',
							description: 'ISO country code of the recipient address',
						},
						{
							displayName: 'Email',
							name: 'recipientEmail',
							type: 'string',
							default: '',
							description: 'Email address of the recipient',
						},
						{
							displayName: 'First Name',
							name: 'recipientFirstName',
							type: 'string',
							default: '',
							description: 'First name of the individual recipient',
						},
						{
							displayName: 'Last Name',
							name: 'recipientLastName',
							type: 'string',
							default: '',
							description: 'Last name of the individual recipient',
						},
						{
							displayName: 'Province',
							name: 'recipientProvinceId',
							type: 'string',
							default: '',
							placeholder: 'CT',
							description: 'Province abbreviation (e.g. CT, MI, RM)',
						},
						...(operation === 'createSdiInvoiceXml'
							? [
									{
										displayName: 'Tax ID Code (Codice Fiscale)',
										name: 'recipientTaxIdCode',
										type: 'string' as const,
										default: '',
										placeholder: 'PCCLFA75L04A494S',
										description: 'Italian fiscal code (Codice Fiscale) of the recipient',
									},
								]
							: []),
						{
							displayName: 'VAT Country',
							name: 'recipientCountryId',
							type: 'string',
							default: 'IT',
							description: 'ISO country code for VAT identification',
						},
						{
							displayName: 'VAT ID Code',
							name: 'recipientIdCode',
							type: 'string',
							default: '',
							placeholder: operation === 'createPeppolInvoiceUbl' ? 'BE0123456789' : '',
							description: 'VAT identification code (leave empty for private individuals)',
						},
						{
							displayName: 'ZIP Code',
							name: 'recipientZipCode',
							type: 'string',
							default: '',
							placeholder: operation === 'createPeppolInvoiceUbl' ? '1000' : '',
							description: 'Postal	/	ZIP code',
						},
					],
				},
			],
		},

		// ── E. Invoice Details ──────────────────────────────────────
		{
			displayName: 'Invoice Details',
			name: 'invoiceDetails',
			type: 'fixedCollection',
			placeholder: 'Set Invoice Detail Fields',
			default: {},
			displayOptions: showForm,
			description: 'Additional invoice metadata (document type, currency, prefix/suffix)',
			options: [
				{
					displayName: 'Details',
					name: 'invoiceDetailValues',
					values: [
						{
							displayName: 'Document Type',
							name: 'docType',
							type: 'options',
							options: [
								{ name: 'TD01 - Invoice', value: 'TD01' },
								{ name: 'TD04 - Credit Note', value: 'TD04' },
							],
							default: 'TD01',
							description: 'Italian e-invoice document type code',
						},
						{
							displayName: 'Currency',
							name: 'currency',
							type: 'options',
							options: [
								{
									name: 'EUR',
									value: 'EUR',
								},
							],
							default: 'EUR',
							description: 'ISO 4217 currency code (Italian invoices require EUR)',
						},
						{
							displayName: 'Invoice Prefix',
							name: 'invoicePrefix',
							type: 'string',
							default: '',
							placeholder: 'WEB',
							description: 'Prefix portion of the invoice number',
						},
						{
							displayName: 'Invoice Suffix',
							name: 'invoiceSuffix',
							type: 'string',
							default: '',
							placeholder: '2025',
							description: 'Suffix portion of the invoice number (e.g. year)',
						},
					],
				},
			],
		},

		// ── F. Order Items ──────────────────────────────────────────
		{
			displayName: 'Order Items',
			name: 'orderItems',
			type: 'fixedCollection',
			placeholder: 'Add Item',
			default: {},
			typeOptions: { multipleValues: true },
			displayOptions: showForm,
			description: 'Line items included in the invoice',
			options: [
				{
					displayName: 'Item',
					name: 'itemValues',
					values: [
						{
							displayName: 'Description',
							name: 'description',
							type: 'string',
							default: '',
							required: true,
							description: 'Item description text',
						},
						{
							displayName: 'Discount',
							name: 'discountType',
							type: 'options',
							options: [
								{ name: 'No', value: 'no' },
								{ name: 'Yes', value: 'yes' },
							],
							default: 'no',
							description: 'Whether this line item has a discount (SC type). If Yes, Discount Percent is required; Discount Amount and Total Price are calculated automatically.',
						},
						{
							displayName: 'Discount Percent',
							name: 'discountPercent',
							type: 'string',
							default: '',
							description: 'Discount percentage (e.g. 10.00) — required when Discount is Yes',
						},
						{
							displayName: 'Gift Product',
							name: 'giftProduct',
							type: 'options',
							options: [
								{
									name: 'No',
									value: 'no',
								},
								{
									name: 'Yes',
									value: 'yes',
								},
							],
							default: 'no',
							description: 'Whether this item is a gift	/	free product',
						},
						{
							displayName: 'Item Code Type',
							name: 'itemCodeType',
							type: 'string',
							default: 'INTERNO',
							description: 'Type of item code (e.g. INTERNO, EAN)',
						},
						{
							displayName: 'Item Code Value',
							name: 'itemCodeValue',
							type: 'string',
							default: '',
							description: 'Value of the item code',
						},
						{
							displayName: 'Item Type',
							name: 'itemType',
							type: 'options',
							options: [
								{
									name: 'Product',
									value: 'product',
								},
								{
									name: 'Shipping',
									value: 'shipping',
								},
								{
									name: 'Fee',
									value: 'fee',
								},
							],
							default: 'product',
							description: 'Category of this line item',
						},
						{
							displayName: 'Quantity',
							name: 'quantity',
							type: 'string',
							default: '1.00',
							description: 'Quantity (e.g. 1.00)',
						},
						{
							displayName: 'Total Tax',
							name: 'totalTax',
							type: 'number',
							default: 0,
							description: 'Tax amount for this line item',
						},
						{
							displayName: 'Unit',
							name: 'unit',
							type: 'string',
							default: 'N.',
							description: 'Unit of measure (e.g. N., KG, LT)',
						},
						{
							displayName: 'Unit Price',
							name: 'unitPrice',
							type: 'string',
							default: '',
							description: 'Price per unit (e.g. 4.09)',
						},
						{
							displayName: 'VAT Rate',
							name: 'rate',
							type: 'string',
							default: '0.00',
							description: 'VAT rate percentage (e.g. 22.00, 10.00, 0.00)',
						},
					],
				},
			],
		},

		// ── G. Payment Data ─────────────────────────────────────────
		{
			displayName: 'Payment Method',
			name: 'paymentMethod',
			type: 'options',
			options: [
				{ name: 'Bank Transfer', value: 'MP05' },
				{ name: 'Cash', value: 'MP01' },
				{ name: 'Check', value: 'MP02' },
				{ name: 'Credit Card', value: 'MP08' },
				{ name: 'Direct Debit', value: 'MP16' },
				{ name: 'PagoPA', value: 'MP23' },
				{ name: 'RIBA', value: 'MP12' },
				{ name: 'SEPA Core Direct Debit', value: 'MP21' },
				{ name: 'SEPA Direct Debit', value: 'MP19' },
				{ name: 'Special Account RIBA', value: 'MP15' },
				{ name: 'Withholding on Payments', value: 'MP22' },
			],
			default: 'MP01',
			displayOptions: showForm,
			description: 'Payment method code',
		},
		{
			displayName: 'Payment Data',
			name: 'paymentData',
			type: 'fixedCollection',
			placeholder: 'Set Payment Fields',
			default: {},
			displayOptions: showForm,
			description: 'Payment terms and amount information',
			options: [
				{
					displayName: 'Payment',
					name: 'paymentValues',
					values: [
						{
							displayName: 'Payment Amount',
							name: 'paymentAmount',
							type: 'string',
							default: '',
							description: 'Amount to be paid (typically equals the total document amount)',
						},
						{
							displayName: 'Payment Terms',
							name: 'termsPayment',
							type: 'options',
							options: [
								{ name: 'TP01 - Instalment', value: 'TP01' },
								{ name: 'TP02 - Full Payment', value: 'TP02' },
								{ name: 'TP03 - Advance', value: 'TP03' },
							],
							default: 'TP02',
							description: 'Payment terms type code',
						},
					],
				},
			],
		},
		{
			displayName: 'Bank Details',
			name: 'bankDetails',
			type: 'fixedCollection',
			placeholder: 'Set Bank Fields',
			default: {},
			required: true,
			displayOptions: {
				show: {
					resource: ['invoices'] as string[],
					operation: [operation] as string[],
					inputMode: ['form'] as string[],
					paymentMethod: ['MP05'] as string[],
				},
			},
			description: 'Bank transfer details (required for MP05 - Bank Transfer)',
			options: [
				{
					displayName: 'Bank',
					name: 'bankValues',
					values: [
						{
							displayName: 'Beneficiary',
							name: 'beneficiary',
							type: 'string',
							required: true,
							default: '',
							description: 'Name of the payment beneficiary',
						},
						{
							displayName: 'Financial Institution',
							name: 'financialInstitution',
							type: 'string',
							required: true,
							default: '',
							description: 'Name of the bank or financial institution',
						},
						{
							displayName: 'IBAN',
							name: 'iban',
							type: 'string',
							required: true,
							default: '',
							description: 'IBAN for bank transfer payments',
						},
					],
				},
			],
		},

		// ── H. Additional Options ───────────────────────────────────
		{
			displayName: 'Additional Options',
			name: 'additionalOptions',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: showForm,
			description: 'Optional and advanced invoice settings',
			options: [
				{
					displayName: 'Connected Invoice Data (JSON)',
					name: 'connectedInvoiceData',
					type: 'json',
					default: '[]',
					description: 'Connected invoice references as a JSON array. Required (each entry needs a numeric identifier) when Document Type is TD04 (Credit Note) for the Sync Document to Zoho action.',
				},
				{
					displayName: 'Document Type (String)',
					name: 'type',
					type: 'string',
					default: 'invoice',
					description: 'Document type string (e.g. invoice, credit_note)',
				},
				{
					displayName: 'Purchase Order Date',
					name: 'purchaseOrderDate',
					type: 'string',
					default: '',
					placeholder: '2025-01-31',
					description: 'Date of the related purchase order (YYYY-MM-DD)',
				},
				{
					displayName: 'Purchase Order ID',
					name: 'purchaseOrderId',
					type: 'string',
					default: '',
					description: 'Reference to the related purchase order',
				},
				{
					displayName: 'Tax Exemption Reason',
					name: 'refNormative',
					type: 'string',
					default: '',
					description: 'Normative reference text for VAT exempt operations',
				},
				{
					displayName: 'VAT Exemption Code',
					name: 'nature',
					type: 'string',
					default: '',
					description: 'Nature code for VAT exempt operations (e.g. N1, N2, N3, N4)',
				},
				{
					displayName: 'VIES',
					name: 'vies',
					type: 'boolean',
					default: false,
					description: 'Whether the transaction is intra-EU and VIES validated',
				},
			],
		},
	];
}
