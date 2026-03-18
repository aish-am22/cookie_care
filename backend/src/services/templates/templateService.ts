import type { ContractTemplate } from '../../../types.js';

// In-memory store. Exported so the legacy server.ts can share the same instance.
export const templateLibrary = new Map<string, ContractTemplate>();

export const templateService = {
  getAll(): ContractTemplate[] {
    return Array.from(templateLibrary.values());
  },

  create(name: string, content: string): ContractTemplate {
    const id = `${Date.now()}-${name.replace(/\s+/g, '-')}`;
    const template: ContractTemplate = { id, name, content };
    templateLibrary.set(id, template);
    return template;
  },

  delete(id: string): boolean {
    return templateLibrary.delete(id);
  },

  has(id: string): boolean {
    return templateLibrary.has(id);
  },
};
