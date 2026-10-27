import { useServerStore } from './server';
import type {
  WorkflowOpenApiDocument,
  WorkflowOpenApiOperation,
  WorkflowOpenApiSchemaNode,
  WorkflowExplorerResponse,
} from '@/types/api';

const METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

export function listOperations(document: WorkflowOpenApiDocument) {
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.entries(operations)
      .filter(([method]) => METHODS.has(method))
      .map(([method, operation]) => ({
        path,
        method,
        operation,
        group: operation.tags?.[0] ?? 'Other',
      })),
  );
}

export function schemaExample(
  document: WorkflowOpenApiDocument,
  node?: WorkflowOpenApiSchemaNode,
  depth = 0,
): unknown {
  if (!node || depth > 8) return null;
  if (node.$ref)
    return schemaExample(
      document,
      document.components?.schemas?.[node.$ref.split('/').pop() ?? ''],
      depth + 1,
    );
  if (node.example !== undefined) return node.example;
  if (node.default !== undefined) return node.default;
  if (node.enum) return node.enum[0];
  if (node.allOf)
    return Object.assign(
      {},
      ...node.allOf.map(child => schemaExample(document, child, depth + 1)),
    );
  if (node.anyOf || node.oneOf)
    return schemaExample(document, (node.anyOf ?? node.oneOf)?.[0], depth + 1);
  if (node.type === 'array')
    return [schemaExample(document, node.items, depth + 1)];
  if (node.type === 'object' || node.properties)
    return Object.fromEntries(
      Object.entries(node.properties ?? {}).map(([key, child]) => [
        key,
        schemaExample(document, child, depth + 1),
      ]),
    );
  if (node.type === 'integer' || node.type === 'number') return 0;
  if (node.type === 'boolean') return false;
  return '';
}

function serverUrl() {
  const url = useServerStore.getState().serverUrl;
  if (!url) throw new Error('Server URL not configured');
  return url.replace(/\/+$/, '');
}

export function buildExplorerRequest(
  path: string,
  operation: WorkflowOpenApiOperation,
  parameters: Record<string, string>,
  apiKey: string,
) {
  // Only operations on this server can receive the explicitly supplied test key.
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('..') ||
    /[?#\\]/.test(path)
  )
    throw new Error('Operation must use a path on this server');
  let resolved = path;
  const query: string[] = [];
  const headers: Record<string, string> = { Accept: 'application/json' };
  for (const parameter of operation.parameters ?? []) {
    const value = parameters[`${parameter.in}:${parameter.name}`] ?? '';
    if (parameter.required && !value.trim())
      throw new Error(`Required ${parameter.in} parameter: ${parameter.name}`);
    if (!value) continue;
    if (parameter.in === 'path')
      resolved = resolved.replace(
        `{${parameter.name}}`,
        encodeURIComponent(value),
      );
    if (parameter.in === 'query')
      query.push(
        `${encodeURIComponent(parameter.name)}=${encodeURIComponent(value)}`,
      );
    if (
      parameter.in === 'header' &&
      !/^(host|cookie|origin|authorization|x-api-key|content-length)$/i.test(
        parameter.name,
      )
    )
      headers[parameter.name] = value;
  }
  if (/\{[^}]+\}/.test(resolved)) throw new Error('Fill all path parameters');
  if (apiKey.trim()) headers['X-API-Key'] = apiKey.trim();
  return {
    path: resolved + (query.length ? `?${query.join('&')}` : ''),
    headers,
  };
}

export const apiExplorerApi = {
  getSchema: async (): Promise<WorkflowOpenApiDocument> => {
    const options = {
      credentials: 'omit' as const,
      redirect: 'error' as const,
    };
    const response = await fetch(`${serverUrl()}/openapi.json`, options);
    if (!response.ok)
      throw new Error(`OpenAPI schema: HTTP ${response.status}`);
    return response.json();
  },
  execute: async (
    path: string,
    method: string,
    operation: WorkflowOpenApiOperation,
    parameters: Record<string, string>,
    body: string,
    apiKey: string,
  ): Promise<WorkflowExplorerResponse> => {
    const built = buildExplorerRequest(path, operation, parameters, apiKey);
    if (!METHODS.has(method)) throw new Error('Unsupported request method');
    let payload: string | undefined;
    if (method !== 'get' && method !== 'head' && body.trim()) {
      JSON.parse(body);
      payload = body;
      built.headers['Content-Type'] = 'application/json';
    } else if (operation.requestBody?.required && !body.trim())
      throw new Error('Request body is required');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30000);
    const start = Date.now();
    try {
      const options = {
        method: method.toUpperCase(),
        headers: built.headers,
        body: payload,
        signal: abort.signal,
        credentials: 'omit' as const,
        redirect: 'error' as const,
      };
      const response = await fetch(`${serverUrl()}${built.path}`, options);
      const text = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        status: response.status,
        statusText: response.statusText,
        body: text,
        duration: Date.now() - start,
        headers,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};
