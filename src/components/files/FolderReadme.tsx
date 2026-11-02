import { useNativeLocale } from '@/i18n';
import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/theme';

const ReadmeWebView = WebView as React.ComponentType<React.ComponentProps<typeof WebView> & {
  onShouldStartLoadWithRequest: (event: {url: string}) => boolean;
}>;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}
export function markdownHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let code = false;
  let list: 'ul' | 'ol' | null = null;
  const result: string[] = [];
  const closeList = () => { if (list) { result.push(`</${list}>`); list = null; } };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^```|^~~~/.test(line)) { closeList(); result.push(code ? '</code></pre>' : '<pre><code>'); code = !code; continue; }
    if (code) { result.push(`${escape(line)}\n`); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { closeList(); result.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      closeList();
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, '').split('|');
      result.push(`<table><thead><tr>${cells(line).map(cell => `<th>${inline(cell.trim())}</th>`).join('')}</tr></thead><tbody>`);
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        result.push(`<tr>${cells(lines[index]).map(cell => `<td>${inline(cell.trim())}</td>`).join('')}</tr>`); index++;
      }
      result.push('</tbody></table>'); index--; continue;
    }
    const entry = /^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
    if (entry) {
      const kind = entry[2] ? 'ol' : 'ul';
      if (list !== kind) { closeList(); result.push(`<${kind}>`); list = kind; }
      result.push(`<li>${inline(entry[3])}</li>`); continue;
    }
    closeList();
    if (/^\s*>/.test(line)) result.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
    else if (line.trim()) result.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (code) result.push('</code></pre>');
  return result.join('');
}

export function FolderReadme({ markdown }: {markdown: string}) {
  useNativeLocale();
  const { colors } = useTheme();
  return <ReadmeWebView
    originWhitelist={['*']}
    source={{html: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px -apple-system,sans-serif;background:${colors.card};color:${colors.text};line-height:1.5;overflow-wrap:anywhere}pre,table{display:block;overflow:auto}td,th{border:1px solid #888;padding:6px}code{font-family:monospace}a{color:${colors.accentLight}}</style>${markdownHtml(markdown)}`}}
    javaScriptEnabled={false}
    onShouldStartLoadWithRequest={event => {
      if (event.url === 'about:blank') return true;
      if (/^https?:\/\//i.test(event.url)) void Linking.openURL(event.url).catch(() => {});
      return false;
    }}
    style={styles.reader}
  />;
}
const styles = StyleSheet.create({ reader: { height: 420 } });
