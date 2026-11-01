import { useTranslation } from '@/i18n';

export function useIntegrationTranslation() {
  const { t } = useTranslation();
  return (label: string) => t(`integrations.${label.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`, { defaultValue: label });
}
