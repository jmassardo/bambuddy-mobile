import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import { AssetPreviewModal } from '@/components/files/AssetPreviewModal';

export default function Model3DPreviewScreen() {
  const navigation = useNavigation<RootNavigationProp<'Model3DPreview'>>();
  const route = useRoute<RootRouteProp<'Model3DPreview'>>();
  const params = route.params;
  return <AssetPreviewModal source={{
    fileId: params.fileId,
    archiveId: params.archiveId,
    filename: params.filename,
    mode: 'model',
  }} onClose={() => navigation.goBack()} />;
}
