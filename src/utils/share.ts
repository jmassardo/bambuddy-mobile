import { translateNative } from '@/i18n';
import Share from 'react-native-share';

function mimeFromFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(translateNative('native.ab9fb229419b1c4a')));
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error(translateNative('native.ab9fb229419b1c4a')));
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
