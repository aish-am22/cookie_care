import { httpClient } from './httpClient';
import type { ContractTemplate } from '../types';

export const templatesApi = {
  getAll(): Promise<ContractTemplate[]> {
    return httpClient.get<ContractTemplate[]>('/api/templates');
  },

  create(name: string, content: string): Promise<ContractTemplate> {
    return httpClient.post<ContractTemplate>('/api/templates', { name, content });
  },

  remove(id: string): Promise<void> {
    return httpClient.delete<void>(`/api/templates/${id}`);
  },
};
