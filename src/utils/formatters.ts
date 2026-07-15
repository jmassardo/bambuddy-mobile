// Utility functions for formatting values in the app

/** Format seconds as "Xh Ym" or "Ym Zs" */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format remaining time as "~Xh Ym" */
export function formatETA(remainingMinutes: number): string {
  if (!remainingMinutes || remainingMinutes <= 0) return '—';
  const h = Math.floor(remainingMinutes / 60);
  const m = Math.round(remainingMinutes % 60);

  if (h > 0) return `~${h}h ${m}m`;
  return `~${m}m`;
}

/** Format grams to a readable string */
export function formatWeight(grams: number): string {
  if (!grams && grams !== 0) return '—';
  if (grams >= 1000) return `${(grams / 1000).toFixed(1)} kg`;
  return `${Math.round(grams)} g`;
}

/** Format cost with currency symbol */
export function formatCost(cost: number, currency: string = '$'): string {
  if (!cost && cost !== 0) return '—';
  return `${currency}${cost.toFixed(2)}`;
}

/** Format percentage */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Format a date string to a readable format */
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Format a date string with full date and time */
export function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Format file size in bytes to human readable */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/** Truncate a filename for display */
export function truncateFilename(filename: string, maxLength: number = 30): string {
  if (filename.length <= maxLength) return filename;
  const ext = filename.lastIndexOf('.');
  if (ext > 0) {
    const extension = filename.substring(ext);
    const name = filename.substring(0, ext);
    const truncated = name.substring(0, maxLength - extension.length - 3);
    return `${truncated}...${extension}`;
  }
  return filename.substring(0, maxLength - 3) + '...';
}

/** Get status color key from print status string */
export function getStatusColorKey(
  status: string,
): 'success' | 'error' | 'warning' | 'info' | 'textTertiary' {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'success':
    case 'done':
      return 'success';
    case 'failed':
    case 'error':
    case 'cancelled':
      return 'error';
    case 'printing':
    case 'in_progress':
    case 'running':
      return 'info';
    case 'queued':
    case 'pending':
    case 'waiting':
    case 'paused':
      return 'warning';
    default:
      return 'textTertiary';
  }
}
