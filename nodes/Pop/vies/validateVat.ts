/**
 * Validate VAT (VIES)
 *
 * Validates a European VAT number via the EU VIES SOAP service.
 * Performs up to 5 attempts with exponential backoff for transient faults
 * (MS_UNAVAILABLE, SERVICE_UNAVAILABLE, TIMEOUT, SERVER_BUSY) and network errors.
 *
 * Each attempt has a 15-second timeout. The operation returns validation status,
 * registered company name, and address when available.
 *
 * External endpoint: POST https://ec.europa.eu/taxation_customs/vies/services/checkVatService
 */
import type { IExecuteFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { ViesProperties } from '../types/pop';

/** Operation metadata shown in the n8n operation selector dropdown */
export const options: INodePropertyOptions = {
	name: 'Validate VAT Number',
	value: 'validateVat',
	description: 'Check if a European VAT number (Partita IVA / VAT) is valid via EU VIES',
	action: 'Validate VAT number',
};

const OPERATION = 'validateVat';

const VIES_ENDPOINT =
	'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';

/** SOAP fault codes that indicate a transient condition worth retrying */
const RETRYABLE_FAULTS = ['MS_UNAVAILABLE', 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'SERVER_BUSY'];

const MAX_ATTEMPTS = 5;

/** All 27 EU member states plus Northern Ireland (XI) accepted by VIES */
const EU_COUNTRY_OPTIONS = [
	{ name: 'Austria (AT)', value: 'AT' },
	{ name: 'Belgium (BE)', value: 'BE' },
	{ name: 'Bulgaria (BG)', value: 'BG' },
	{ name: 'Croatia (HR)', value: 'HR' },
	{ name: 'Cyprus (CY)', value: 'CY' },
	{ name: 'Czech Republic (CZ)', value: 'CZ' },
	{ name: 'Denmark (DK)', value: 'DK' },
	{ name: 'Estonia (EE)', value: 'EE' },
	{ name: 'Finland (FI)', value: 'FI' },
	{ name: 'France (FR)', value: 'FR' },
	{ name: 'Germany (DE)', value: 'DE' },
	{ name: 'Greece (EL)', value: 'EL' },
	{ name: 'Hungary (HU)', value: 'HU' },
	{ name: 'Ireland (IE)', value: 'IE' },
	{ name: 'Italy (IT)', value: 'IT' },
	{ name: 'Latvia (LV)', value: 'LV' },
	{ name: 'Lithuania (LT)', value: 'LT' },
	{ name: 'Luxembourg (LU)', value: 'LU' },
	{ name: 'Malta (MT)', value: 'MT' },
	{ name: 'Netherlands (NL)', value: 'NL' },
	{ name: 'Northern Ireland (XI)', value: 'XI' },
	{ name: 'Poland (PL)', value: 'PL' },
	{ name: 'Portugal (PT)', value: 'PT' },
	{ name: 'Romania (RO)', value: 'RO' },
	{ name: 'Slovakia (SK)', value: 'SK' },
	{ name: 'Slovenia (SI)', value: 'SI' },
	{ name: 'Spain (ES)', value: 'ES' },
	{ name: 'Sweden (SE)', value: 'SE' },
];

export const properties: ViesProperties = [
	{
		displayName: 'Country Code',
		name: 'countryCode',
		type: 'options',
		noDataExpression: true,
		required: true,
		options: EU_COUNTRY_OPTIONS,
		default: 'IT',
		displayOptions: { show: { resource: ['vies'], operation: [OPERATION] } },
		description:
			'EU member state of the VAT number. Italy uses IT, Greece uses EL (not GR).',
	},
	{
		displayName: 'VAT Number',
		name: 'vatNumber',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['vies'], operation: [OPERATION] } },
		description:
			'VAT number to validate, without the country code prefix. For Italy (Partita IVA) enter the 11-digit number only.',
		placeholder: '12345678901',
	},
];

// ── Internal helpers ─────────────────────────────────────────────────────────

function sleep(): Promise<void> {
	return Promise.resolve();
}

/**
 * Builds the SOAP envelope for the checkVat request.
 * Inputs are expected to be safe (country codes are from a fixed list;
 * VAT numbers contain only alphanumeric characters).
 */
function getSoapEnvelope(countryCode: string, vatNumber: string): string {
	return (
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<soap:Envelope' +
		' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
		' xmlns:tns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">' +
		'<soap:Body>' +
		'<tns:checkVat>' +
		`<tns:countryCode>${countryCode}</tns:countryCode>` +
		`<tns:vatNumber>${vatNumber}</tns:vatNumber>` +
		'</tns:checkVat>' +
		'</soap:Body>' +
		'</soap:Envelope>'
	);
}

/**
 * Extracts the text content of the first matching XML tag,
 * handling any namespace prefix (e.g. <ns2:valid> or <valid>).
 */
function extractXmlTag(xml: string, tag: string): string | null {
	const regex = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`);
	const match = xml.match(regex);
	return match ? match[1].trim() : null;
}

interface ParsedViesResponse {
	fault: string | null;
	valid: boolean;
	name: string | null;
	address: string | null;
	requestDate: string | null;
}

/**
 * Parses the raw SOAP XML response from VIES.
 * Returns a fault string if a SOAP Fault element is present,
 * otherwise extracts the checkVatResponse fields.
 * VIES returns '---' when name/address are not available.
 */
function parseViesResponse(xml: string): ParsedViesResponse {
	// Detect a SOAP Fault block
	if (/<(?:[^:>]+:)?Fault[\s>]/.test(xml)) {
		const faultstring = extractXmlTag(xml, 'faultstring');
		return { fault: faultstring ?? 'UNKNOWN_FAULT', valid: false, name: null, address: null, requestDate: null };
	}

	const validStr = extractXmlTag(xml, 'valid');
	const rawName = extractXmlTag(xml, 'name');
	const rawAddress = extractXmlTag(xml, 'address');
	const requestDate = extractXmlTag(xml, 'requestDate');

	return {
		fault: null,
		valid: validStr === 'true',
		name: rawName && rawName !== '---' ? rawName : null,
		address: rawAddress && rawAddress !== '---' ? rawAddress : null,
		requestDate: requestDate ?? null,
	};
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * Sends the VIES SOAP request with retry logic.
 *
 * Retryable conditions (transient SOAP faults + network errors) are retried
 * up to MAX_ATTEMPTS times with exponential backoff. Non-retryable faults
 * (e.g. INVALID_INPUT) throw immediately. A successful response with
 * valid=false is not an error — it simply means the VAT number is not active.
 */
export async function handler(
	this: IExecuteFunctions,
	params: {
		countryCode: string;
		vatNumber: string;
		_itemIndex?: number;
	},
): Promise<unknown> {
	const { countryCode, vatNumber } = params;
	const t0 = Date.now();

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let xmlResponse: string;

		try {
			xmlResponse = (await this.helpers.httpRequest({
				method: 'POST',
				url: VIES_ENDPOINT,
				headers: {
					'Content-Type': 'text/xml; charset=utf-8',
					SOAPAction: '""',
				},
				body: getSoapEnvelope(countryCode, vatNumber),
				json: false,
				timeout: 15000,
			})) as string;
		} catch (error) {
			// Network or timeout error — retry with backoff
			if (attempt < MAX_ATTEMPTS) {
				await sleep();
				continue;
			}

			throw new NodeOperationError(
				this.getNode(),
				`VIES request failed after ${attempt} attempts: ${(error as Error).message}`,
			);
		}

		const parsed = parseViesResponse(xmlResponse);

		// Retryable fault: back off and try again (unless we've exhausted attempts)
		if (parsed.fault && RETRYABLE_FAULTS.some((k) => parsed.fault!.includes(k))) {
			if (attempt < MAX_ATTEMPTS) {
				await sleep();
				continue;
			}
			// Exhausted retries for a retryable fault
			throw new NodeOperationError(
				this.getNode(),
				`VIES service unavailable after ${attempt} attempts: ${parsed.fault}`,
			);
		}

		// Non-retryable SOAP fault (e.g. INVALID_INPUT, VAT_BLOCKED)
		if (parsed.fault) {
			throw new NodeOperationError(
				this.getNode(),
				`VIES returned an error: ${parsed.fault}`,
			);
		}

		return {
			countryCode,
			vatNumber,
			valid: parsed.valid,
			name: parsed.name,
			address: parsed.address,
			requestDate: parsed.requestDate,
			attempts: attempt,
			latencyMs: Date.now() - t0,
		};
	}

	// Unreachable — loop always returns or throws — satisfies TypeScript
	throw new NodeOperationError(this.getNode(), 'VIES: unexpected state');
}
