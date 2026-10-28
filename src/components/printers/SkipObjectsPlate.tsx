import { useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView as NativeWebView } from 'react-native-webview';
import { useQuery } from '@tanstack/react-query';
import { requestBlob } from '@/api/http';
import { blobToDataUrl } from '@/utils/share';

import { useTheme } from '@/theme';

interface PlateWebViewHandle { injectJavaScript: (script: string) => void }
const WebView = NativeWebView as unknown as React.ForwardRefExoticComponent<{
  source: { html: string };
  originWhitelist: string[];
  scrollEnabled: boolean;
  onLoadEnd: () => void;
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
} & React.RefAttributes<PlateWebViewHandle>>;

export function plateDocument(top: string, pick: string) {
  if (!/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(top)
    || !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(pick)) return '';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#111}canvas{width:100%;height:auto;display:block}</style></head><body><canvas id="plate"></canvas><script>
  const top=new Image(),pick=new Image(),canvas=document.getElementById('plate'),ctx=canvas.getContext('2d');
  let pixels=null,selected=[],skipped=[];
  window.selectIds=(ids,skip)=>{selected=ids;skipped=skip;draw()};
  function draw(){if(!pixels||!top.complete)return;ctx.drawImage(top,0,0,canvas.width,canvas.height);const overlay=ctx.createImageData(canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){const id=pixels.data[i]+(pixels.data[i+1]<<8)+(pixels.data[i+2]<<16);if(!pixels.data[i+3])continue;
      if(id&&(selected.includes(id)||skipped.includes(id))){overlay.data[i]=255;overlay.data[i+1]=skipped.includes(id)?40:150;overlay.data[i+2]=0;overlay.data[i+3]=120}}
    const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;layer.getContext('2d').putImageData(overlay,0,0);ctx.drawImage(layer,0,0)}
  pick.onload=()=>{canvas.width=pick.naturalWidth;canvas.height=pick.naturalHeight;const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;const m=mask.getContext('2d');m.drawImage(pick,0,0);pixels=m.getImageData(0,0,mask.width,mask.height);draw()};
  top.onload=draw;
  canvas.onclick=e=>{if(!pixels)return;const r=canvas.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)*canvas.width/r.width),y=Math.floor((e.clientY-r.top)*canvas.height/r.height),i=(y*canvas.width+x)*4;if(x<0||y<0||x>=canvas.width||y>=canvas.height||!pixels.data[i+3])return;const id=pixels.data[i]+(pixels.data[i+1]<<8)+(pixels.data[i+2]<<16);if(id)window.ReactNativeWebView.postMessage(String(id))};
  top.src=${JSON.stringify(top)};pick.src=${JSON.stringify(pick)};
  </script></body></html>`;
}

export function SkipObjectsPlate({ printerId, printKey, selected, skipped, onSelect }: {
  printerId: number; printKey: string; selected: number[]; skipped: number[]; onSelect: (id: number) => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const ref = useRef<PlateWebViewHandle>(null);
  const images = useQuery({
    queryKey: ['skipPlateImages', printerId, printKey],
    queryFn: async () => {
      const [top, pick] = await Promise.all(['top', 'pick'].map(async view =>
        blobToDataUrl(await requestBlob(`/printers/${printerId}/cover?view=${view}`))));
      return { top, pick };
    },
  });
  const html = useLocalizedMemo(() => images.data ? plateDocument(images.data.top, images.data.pick) : '', [images.data]);
  const update = () => ref.current?.injectJavaScript(`window.selectIds&&window.selectIds(${JSON.stringify(selected)},${JSON.stringify(skipped)});true;`);
  useEffect(() => {
    ref.current?.injectJavaScript(`window.selectIds&&window.selectIds(${JSON.stringify(selected)},${JSON.stringify(skipped)});true;`);
  }, [selected, skipped]);
  if (!html) return <Text style={{ color: colors.textSecondary }}>{images.isLoading
    ? t('device.loadingPlate', { defaultValue: 'Loading plate image…' })
    : t('device.noPlateMask', { defaultValue: 'Plate selection image unavailable. Use the object list below.' })}</Text>;
  return <View style={styles.plate}>
    <WebView ref={ref} source={{ html }} originWhitelist={['about:blank']} scrollEnabled={false}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onLoadEnd={update} onMessage={event => {
        const id = Number(event.nativeEvent.data);
        if (Number.isSafeInteger(id) && id >= 0) onSelect(id);
      }} />
  </View>;
}

const styles = StyleSheet.create({ plate: { height: 320, width: '100%' } });
