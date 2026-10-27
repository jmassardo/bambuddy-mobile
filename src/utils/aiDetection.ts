import type { WorkflowAiDetection } from '@/types/api';

export function aiDetectionClass(
  detection?: WorkflowAiDetection,
): 'safe' | 'warning' | 'failure' | 'error' | 'idle' | 'unknown' {
  if (!detection) return 'idle';
  switch (detection.class) {
    case 'safe':
    case 'warning':
    case 'failure':
    case 'error':
      return detection.class;
    default:
      return 'unknown';
  }
}

export function hasAiVerdict(detection?: WorkflowAiDetection): boolean {
  return (
    !!detection && ['safe', 'warning', 'failure'].includes(detection.class)
  );
}

export function aiDetectionSummary(detection?: WorkflowAiDetection): string {
  const classification = aiDetectionClass(detection);
  return hasAiVerdict(detection)
    ? `${classification} • ${detection!.score.toFixed(3)} • ${
        detection!.frame_count
      } frames`
    : classification === 'error'
    ? 'error • not checking'
    : `${classification} • no inference yet`;
}
