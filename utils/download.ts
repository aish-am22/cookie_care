/** File download helpers for the browser. */

/**
 * Trigger a browser download of a plain-text string as a file.
 */
export function downloadText(content: string, filename: string): void {
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
}

/**
 * Trigger a browser download of a JSON-serialisable value as a `.json` file.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), filename);
}

/**
 * Trigger a browser download of a Blob with the given filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoke after a short delay to ensure the browser has had time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
