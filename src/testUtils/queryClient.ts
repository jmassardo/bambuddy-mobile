import { QueryClient } from '@tanstack/react-query';

const queryClients = new Set<QueryClient>();

export function createTestQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  queryClients.add(client);
  return client;
}

export function clearTestQueryClients() {
  queryClients.forEach(client => client.clear());
  queryClients.clear();
}
