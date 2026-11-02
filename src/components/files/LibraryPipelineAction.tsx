import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { PrimaryButton } from '@/components/common/AppUI';
import { RunWithPipelineModal } from '@/components/slicing/RunWithPipelineModal';
import { useAuth } from '@/contexts/AuthContext';

export function LibraryPipelineAction({
  fileId,
  filename,
  isFolder,
}: {
  fileId: number;
  filename: string;
  isFolder: boolean;
}) {
  useNativeLocale();
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const eligible =
    !isFolder &&
    /\.(3mf|stl|step|stp)$/i.test(filename) &&
    !/\.gcode(\.3mf)?$/i.test(filename);
  if (
    !eligible ||
    !hasPermission('pipelines:read') ||
    !hasPermission('pipelines:run')
  ) {
    return null;
  }
  return (
    <>
      <PrimaryButton
        label={t('library.runWithPipeline', {
          defaultValue: 'Run with pipeline',
        })}
        variant="secondary"
        onPress={() => setVisible(true)}
      />
      {visible ? (
        <RunWithPipelineModal
          visible
          onClose={() => setVisible(false)}
          sourceType="file"
          sourceId={fileId}
          sourceName={filename}
        />
      ) : null}
    </>
  );
}
