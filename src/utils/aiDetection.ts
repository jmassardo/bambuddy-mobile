import { translateNative } from '@/i18n';
import type { WorkflowAiDetection } from '@/types/api';
const classificationLabels = {
  get safe() { return translateNative('workflow.ai.label.safe', { defaultValue: 'safe' }); },
  get warning() { return translateNative('workflow.ai.label.warning', { defaultValue: 'warning' }); },
  get failure() { return translateNative('workflow.ai.label.failure', { defaultValue: 'failure' }); },
  get error() { return translateNative('workflow.ai.label.error', { defaultValue: 'error' }); },
  get idle() { return translateNative('workflow.ai.label.idle', { defaultValue: 'idle' }); },
  get unknown() { return translateNative('workflow.ai.label.unknown', { defaultValue: 'unknown' }); },
};

export function aiDetectionLabel(classification: keyof typeof classificationLabels): string {
  return classificationLabels[classification];
}

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
    ? translateNative('native.3e1ae69ca3052c15', { value0: aiDetectionLabel(classification), value1: String(detection!.score.toFixed(3)), value2: String(detection!.frame_count) })
    : classification === 'error'
    ? translateNative('native.75558f7d7afdf8fb')
    : translateNative('native.ce45ec2289c2d2a2', { value0: aiDetectionLabel(classification) });
}
