import Share from 'react-native-share';

function mimeFromFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read file data.'));
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file data.'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareBlob(blob: Blob, filename: string) {
  const url = await blobToDataUrl(blob);
  await Share.open({
    url,
    type: blob.type || mimeFromFilename(filename),
    filename,
    failOnCancel: false,
    saveToFiles: true,
  });
}
