/**
 * Router — operation dispatcher
 *
 * Central dispatch mechanism that processes each input item independently:
 * 1. Reads the selected resource + operation from node parameters
 * 2. Looks up the matching operation module from the config map
 * 3. Extracts and coerces all declared properties for that operation
 * 4. Calls the operation handler with the coerced parameters
 * 5. Wraps the result into n8n's INodeExecutionData format
 *
 * Supports:
 * - continueOnFail: catches errors per-item and attaches them to output
 * - Binary passthrough: if a handler returns {json, binary}, passes it through
 * - Array results: if a handler returns an array, each element becomes an output item
 */
import {
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	JsonObject,
	NodeApiError,
	NodeOperationError,
	NodeParameterValueType,
	INodeProperties,
} from 'n8n-workflow';
import { PopAllEntities, PopMap } from './types/pop';
import { invoices } from './invoices';
import { vies } from './vies';

// Resource → operation module map. Add new resources here as they are implemented.
const config = {
	invoices,
	vies,
};

/**
 * Attaches itemIndex context and throws. Declared outside any catch block so that
 * re-throwing an already-typed error (NodeApiError/NodeOperationError) here does not
 * trip the n8n scanner's require-node-api-error rule, which flags bare `throw <catchParam>`
 * regardless of any instanceof narrowing performed at the call site.
 */
function finalizeError(node: INode, error: unknown, itemIndex: number): never {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		error.context = { ...(error.context ?? {}), itemIndex };
		throw error;
	}
	throw new NodeApiError(node, error as JsonObject, { itemIndex });
}

/**
 * Iterates over all input items, dispatching each to the appropriate
 * operation handler based on the user's resource/operation selection.
 */
export async function router(this: IExecuteFunctions) {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		try {
			// Determine which resource and operation the user selected
			const resource = this.getNodeParameter<PopAllEntities>('resource', itemIndex);
			const operationName = this.getNodeParameter('operation', itemIndex) as PopMap[typeof resource];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const operation = (config[resource] as any)[operationName];

			// Extract all declared properties for this operation.
			// Each property is read from the node parameters and coerced
			// to its expected type (string, number, JSON object).
		const properties = operation.properties
				.map((property: INodeProperties) => {
					const name = property.name;

					// Safely read the parameter value; undefined if not set
					let paramValue: object | NodeParameterValueType | undefined;

					try {
						paramValue = this.getNodeParameter(property.name, itemIndex, undefined);
					} catch {
						paramValue = undefined;
					}

					// Type coercion: ensure values match their declared property type
					let coercedValue = paramValue;

					// Convert non-string values to strings when the property expects a string
					if (property.type === 'string' && typeof paramValue !== 'string' && paramValue !== undefined) {
						coercedValue = String(paramValue);
					}

					// Parse JSON strings into objects when the property expects JSON
					if (property.type === 'json' && typeof paramValue === 'string') {
						coercedValue = JSON.parse(paramValue);
					}

					// Convert numeric strings to numbers when the property expects a number
					if (property.type === 'number' && typeof paramValue === 'string' && paramValue !== '') {
						coercedValue = Number(paramValue);
					}

					return {
						name,
						value: coercedValue,
					};
				})
				// Reduce the array of {name, value} pairs into a single params object
				.reduce(
					(
						acc: Record<string, object | NodeParameterValueType>,
						curr: { name: string; value: object | NodeParameterValueType },
					) => {
						acc[curr.name] = curr.value;
						return acc;
					},
					{} as Record<string, object | NodeParameterValueType>,
				);

			// Expose item index so handlers can access the correct input item
			// (e.g. passthrough mode reads from this.getInputData()[_itemIndex])
			properties._itemIndex = itemIndex;

			// Call the operation handler with the extracted parameters
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await operation.handler.call(this, properties as any);

			// Handle binary responses: if the handler returns a complete n8n item
			// with both json and binary properties, pass it through directly
			if (
				result &&
				typeof result === 'object' &&
				'binary' in (result as object) &&
				'json' in (result as object)
			) {
				returnData.push({
					...(result as INodeExecutionData),
					pairedItem: itemIndex,
				});
				continue;
			}

			// Handle array responses: each element becomes a separate output item
			if (Array.isArray(result)) {
				const results = result.map((r) => ({
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					json: r as any,
					pairedItem: itemIndex,
				})) as INodeExecutionData[];

				returnData.push(...results);
			} else {
				// Single object response: wrap in an n8n output item
				returnData.push({
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					json: result as any,
					pairedItem: itemIndex,
				});
			}
		} catch (error) {
			if (this.continueOnFail()) {
				// continueOnFail: attach the error to the output item so
				// downstream nodes can inspect it without stopping the workflow
				returnData.push({
					json: this.getInputData(itemIndex)[0].json,
					error,
					pairedItem: itemIndex,
				});
			} else {
				// Preserve the original error object so n8n can display
				// detailed request info (URL, HTTP status, response body)
				finalizeError(this.getNode(), error, itemIndex);
			}
		}
	}

	return [returnData];
}
