import { useState, useCallback } from 'react';
import type { ContractTemplate } from '../types';
import { templatesApi } from '../api/templatesApi';

interface UseTemplatesResult {
  templates: ContractTemplate[];
  isLoading: boolean;
  error: string | null;
  fetchTemplates: () => Promise<void>;
  addTemplate: (name: string, content: string) => Promise<ContractTemplate>;
  removeTemplate: (id: string) => Promise<void>;
}

export function useTemplates(): UseTemplatesResult {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await templatesApi.getAll();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addTemplate = useCallback(async (name: string, content: string): Promise<ContractTemplate> => {
    setError(null);
    try {
      const template = await templatesApi.create(name, content);
      setTemplates((prev) => [...prev, template]);
      return template;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create template.';
      setError(message);
      throw err;
    }
  }, []);

  const removeTemplate = useCallback(async (id: string): Promise<void> => {
    setError(null);
    try {
      await templatesApi.remove(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete template.';
      setError(message);
      throw err;
    }
  }, []);

  return { templates, isLoading, error, fetchTemplates, addTemplate, removeTemplate };
}
