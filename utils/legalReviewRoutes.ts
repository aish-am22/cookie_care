export const LEGAL_TEMPLATE_ROUTE_PREFIX = '#/legal/templates/';

export function buildTemplatePreviewHash(templateId: string): string {
  return `${LEGAL_TEMPLATE_ROUTE_PREFIX}${encodeURIComponent(templateId)}`;
}

export function parseTemplatePreviewHash(hash: string): string | null {
  if (!hash.startsWith(LEGAL_TEMPLATE_ROUTE_PREFIX)) return null;
  const encodedId = hash.slice(LEGAL_TEMPLATE_ROUTE_PREFIX.length).split(/[/?#]/)[0];
  return encodedId ? decodeURIComponent(encodedId) : null;
}
