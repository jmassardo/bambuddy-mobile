import React, { useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewHandle } from 'react-native-webview';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useServerStore } from '@/api/server';

const SAFE_NOTE_LINK = /^(?:https?:\/\/|mailto:|tel:|sms:|\/(?!\/)|#)\S*$/i;

export function notesDocument(value: string, editable: boolean, textColor: string, background: string, serverUrl = '') {
  const encoded = JSON.stringify(value).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data:">
<style>body{margin:8px;color:${textColor};background:${background};font:16px -apple-system,Roboto,sans-serif;overflow-wrap:anywhere}#notes{min-height:${editable ? 220 : 30}px;outline:none}a{color:#1d9bf0}li{margin:4px 0}img{max-width:100%;height:auto}</style></head>
<body><div id="notes" contenteditable="${editable}" role="${editable ? 'textbox' : 'document'}" aria-multiline="true"></div>
<script>
const editor=document.getElementById('notes');
const serverBase=${JSON.stringify(serverUrl).replace(/</g, '\\u003c')};
if(serverBase){const base=document.createElement('base');base.href=serverBase+'/';document.head.appendChild(base)}
const safeLink=new RegExp(${JSON.stringify(SAFE_NOTE_LINK.source)},'i');
const parsed=new DOMParser().parseFromString(${encoded},'text/html');
const allowed=new Set(['P','DIV','BR','B','STRONG','I','EM','U','UL','OL','LI','A','SPAN','H1','H2','H3','H4','BLOCKQUOTE','PRE','CODE','S','STRIKE','HR','SUB','SUP','IMG']);
function clean(node){
  if(node.nodeType===3)return document.createTextNode(node.textContent);
  if(node.nodeType!==1)return document.createTextNode('');
  if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH'].includes(node.tagName))return document.createTextNode('');
  const safe=document.createElement(allowed.has(node.tagName)?node.tagName:'span');
  const align=node.style.textAlign || node.getAttribute('align');
  if(['left','center','right','justify'].includes(align))safe.style.textAlign=align;
  for(const name of ['fontWeight','fontStyle','textDecoration']){
    const v=node.style[name];
    if(/^(bold|[1-9]00|italic|underline|line-through|none|normal)$/.test(v))safe.style[name]=v;
  }
  if(node.style.color && CSS.supports('color',node.style.color))safe.style.color=node.style.color;
  if(node.tagName==='OL' && /^\\d+$/.test(node.getAttribute('start')||''))safe.setAttribute('start',node.getAttribute('start'));
  if(node.tagName==='A' && safeLink.test(node.getAttribute('href')||''))safe.setAttribute('href',node.getAttribute('href'));
  if(node.tagName==='IMG'){
    const src=node.getAttribute('src')||'';
    if(/^(https?:\\/\\/|\\/(?!\\/)|data:image\\/(png|jpeg|gif|webp);base64,)/i.test(src))safe.setAttribute('src',src);
    safe.setAttribute('alt',node.getAttribute('alt')||'');
    if(node.getAttribute('title'))safe.setAttribute('title',node.getAttribute('title'));
  }
  Array.from(node.childNodes).forEach(child=>safe.appendChild(clean(child)));return safe;
}
Array.from(parsed.body.childNodes).forEach(node=>editor.appendChild(clean(node)));
function send(data){window.ReactNativeWebView.postMessage(JSON.stringify(data))}
let savedRange=null;
document.addEventListener('selectionchange',()=>{const sel=getSelection();if(sel.rangeCount && editor.contains(sel.anchorNode))savedRange=sel.getRangeAt(0).cloneRange()});
function update(){send({type:'change',html:editor.innerHTML});height()}
function height(){send({type:'height',height:document.documentElement.scrollHeight})}
window.noteCommand=function(command,value){
 editor.focus();if(savedRange){const sel=getSelection();sel.removeAllRanges();sel.addRange(savedRange)}
 document.execCommand(command,false,value||null);update();
};
editor.addEventListener('input',update);
editor.addEventListener('paste',event=>{
 event.preventDefault();
 const html=event.clipboardData.getData('text/html');
 const content=document.createElement('div');
 if(html){const pasted=new DOMParser().parseFromString(html,'text/html');Array.from(pasted.body.childNodes).forEach(node=>content.appendChild(clean(node)))}
 else{event.clipboardData.getData('text/plain').split('\\n').forEach((line,index)=>{if(index)content.appendChild(document.createElement('br'));content.appendChild(document.createTextNode(line))})}
 document.execCommand('insertHTML',false,content.innerHTML);update();
});
editor.addEventListener('click',event=>{const a=event.target.closest('a');if(a){event.preventDefault();${editable ? '' : "send({type:'link',url:a.getAttribute('href')})"}}});
new ResizeObserver(height).observe(editor);
height();
</script></body></html>`;
}

export function RichProjectNotes({ value, editable = false, onChange }: {
  value: string;
  editable?: boolean;
  onChange?: (html: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const serverUrl = useServerStore(state => state.serverUrl);
  const ref = useRef<WebViewHandle>(null);
  const initial = useRef(value);
  const [height, setHeight] = useState(editable ? 260 : 100);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const html = useMemo(() => notesDocument(initial.current, editable, colors.text, colors.surface, serverUrl ?? ''), [editable, colors.text, colors.surface, serverUrl]);
  const command = (name: string, argument?: string) =>
    ref.current?.injectJavaScript(`window.noteCommand(${JSON.stringify(name)},${JSON.stringify(argument ?? null)});true;`);
  const tools = [
    ['bold', t('projects.notes.bold', { defaultValue: 'Bold' })],
    ['italic', t('projects.notes.italic', { defaultValue: 'Italic' })],
    ['underline', t('projects.notes.underline', { defaultValue: 'Underline' })],
    ['insertUnorderedList', t('projects.notes.bullets', { defaultValue: 'Bullets' })],
    ['insertOrderedList', t('projects.notes.numbered', { defaultValue: 'Numbered list' })],
    ['justifyLeft', t('projects.notes.left', { defaultValue: 'Align left' })],
    ['justifyCenter', t('projects.notes.center', { defaultValue: 'Center' })],
    ['justifyRight', t('projects.notes.right', { defaultValue: 'Align right' })],
    ['justifyFull', t('projects.notes.justify', { defaultValue: 'Justify' })],
    ['unlink', t('projects.notes.unlink', { defaultValue: 'Remove link' })],
  ];
  return (
    <View style={styles.container}>
      {editable ? <View style={styles.toolbar}>
        {tools.map(([name, label]) => <PrimaryButton key={name} label={label} variant="secondary" onPress={() => command(name)} />)}
        <PrimaryButton label={t('projects.notes.link', { defaultValue: 'Add link' })} variant="secondary" onPress={() => setLinkOpen(true)} />
      </View> : null}
      {linkOpen ? <View style={styles.container}>
        <TextField label={t('projects.notes.url', { defaultValue: 'Link URL (https://, mailto:, tel:)' })} value={link} onChangeText={setLink} autoCapitalize="none" />
        <PrimaryButton label={t('common.save')} disabled={!SAFE_NOTE_LINK.test(link.trim())} onPress={() => { command('createLink', link.trim()); setLinkOpen(false); setLink(''); }} />
        <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={() => setLinkOpen(false)} />
      </View> : null}
      <WebView ref={ref} source={{ html }} style={[styles.webview, { height }]}
        originWhitelist={['*']} scrollEnabled={editable}
        javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
        onMessage={event => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as { type: string; html?: string; height?: number; url?: string };
            if (data.type === 'change' && editable && typeof data.html === 'string') onChange?.(data.html);
            if (data.type === 'height' && typeof data.height === 'number') setHeight(editable ? 260 : Math.max(50, data.height));
            if (data.type === 'link' && data.url && SAFE_NOTE_LINK.test(data.url)) {
              const target = new URL(data.url, serverUrl || undefined).toString();
              void Linking.openURL(target).catch(() => showToast(t('projects.notes.linkError', { defaultValue: 'Unable to open link.' }), 'error'));
            }
          } catch { /* Ignore messages not generated by the editor. */ }
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  webview: { flex: 0, backgroundColor: 'transparent' },
});
