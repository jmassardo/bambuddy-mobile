export function timelapseRange(
  start: string,
  end: string,
  duration: number,
  speed: number,
) {
  const trimStart = Number(start);
  const trimEnd = Number(end);
  if (
    !Number.isFinite(trimStart) ||
    !Number.isFinite(trimEnd) ||
    trimStart < 0 ||
    trimEnd <= trimStart ||
    trimEnd > duration
  ) {
    throw new Error(
      'Choose a start and end within the video, with end after start.',
    );
  }
  if (speed < 0.25 || speed > 4)
    throw new Error('Speed must be between 0.25 and 4.');
  return {
    trimStart,
    trimEnd,
    speed,
    outputDuration: (trimEnd - trimStart) / speed,
  };
}

export function timelapsePreviewHtml(params: {
  video: string;
  audio: string | null;
  start: number;
  end: number;
  speed: number;
  muted: boolean;
  volume: number;
}) {
  const values = JSON.stringify(params).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src http: https: data: blob:"><style>body{margin:0;background:#000}video{width:100%;height:100vh}</style></head><body><video id="v" controls playsinline></video><audio id="a"></audio><script>
const p=${values},v=document.getElementById('v'),a=document.getElementById('a');
v.src=p.video; if(p.audio) a.src=p.audio; v.muted=Boolean(p.audio);a.volume=p.volume;a.muted=p.muted;
v.addEventListener('loadedmetadata',()=>{v.currentTime=p.start;v.playbackRate=p.speed;});
const sync=()=>{const expected=Math.max(0,(v.currentTime-p.start)/p.speed);if(p.audio&&Number.isFinite(a.duration)&&Math.abs(a.currentTime-expected)>0.25)a.currentTime=Math.min(expected,a.duration);};
v.addEventListener('play',()=>{sync();if(p.audio)a.play().catch(()=>{});});
v.addEventListener('pause',()=>a.pause());
v.addEventListener('seeking',sync);
v.addEventListener('ratechange',()=>{v.playbackRate=p.speed;});
v.addEventListener('timeupdate',()=>{if(v.currentTime>=p.end){v.pause();a.pause();v.currentTime=p.start;}else if(v.currentTime<p.start)v.currentTime=p.start;sync();window.ReactNativeWebView.postMessage(JSON.stringify({time:v.currentTime}));});
v.addEventListener('error',()=>window.ReactNativeWebView.postMessage(JSON.stringify({error:'Video preview could not load.'})));
document.addEventListener('visibilitychange',()=>{if(document.hidden){v.pause();a.pause();}});
</script></body></html>`;
}
