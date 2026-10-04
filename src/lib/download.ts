export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
