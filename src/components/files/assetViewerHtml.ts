export interface AssetViewerContent {
  data: string;
  filename: string;
  mode: 'model' | 'gcode' | 'document' | 'image';
  plate?: number;
  plates?: Array<Record<string, unknown>>;
  background: string;
  foreground: string;
  labels: Record<string, string>;
}

// Content is fetched by the native authenticated transport. Neither bearer tokens
// nor server URLs enter the script context or third-party module requests.
export function assetViewerHtml(content: AssetViewerContent): string {
  const config = JSON.stringify(content).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8">
<style>
body{margin:0;background:${content.background};color:${content.foreground};font:14px -apple-system,sans-serif}
#bar{position:sticky;top:0;padding:8px;display:flex;flex-wrap:wrap;gap:8px;background:${content.background};z-index:5;max-height:30vh;overflow:auto}
button,select,input{font:inherit;padding:8px;border:1px solid #888;border-radius:6px;color:inherit;background:transparent}select option{color:#111}label{white-space:nowrap}input[type=number]{width:65px}
#stage{height:calc(100vh - 100px);overflow:auto;touch-action:pan-x pan-y}#status{padding:10px;white-space:pre-wrap}canvas{display:block}table{border-collapse:collapse;white-space:pre}td,th{border:1px solid #888;padding:6px;max-width:500px;overflow:hidden}th{position:sticky;top:0;background:${content.background}}img{display:block;max-width:none}#filters{display:flex;gap:8px;flex-wrap:wrap}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/"}}</script>
</head><body><div id="bar"></div><div id="status"></div><div id="stage"></div>
<script>window.CONFIG=${config};</script>
<script type="module">${viewerRuntime}</script></body></html>`;
}

export const viewerRuntime = String.raw`
const cfg=window.CONFIG, bar=document.getElementById('bar'), stage=document.getElementById('stage'), status=document.getElementById('status');
const label=(key)=>cfg.labels[key]||key;
const send=(type,payload)=>window.ReactNativeWebView?.postMessage(JSON.stringify({type,...payload}));
const fail=e=>{clearTimeout(watchdog);status.textContent=label('failed')+'\n'+(e?.message||e);send('error',{message:String(e?.message||e)});};
const watchdog=setTimeout(()=>fail(new Error(label('timeout'))),90000);
window.addEventListener('unhandledrejection',e=>fail(e.reason));
window.addEventListener('error',e=>fail(e.error||e.message));
const script=url=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(new Error(label('moduleFailed')));document.head.appendChild(s);});
function button(text,callback){const b=document.createElement('button');b.textContent=text;b.onclick=()=>Promise.resolve().then(callback).catch(fail);bar.appendChild(b);return b;}
function select(values,callback){const s=document.createElement('select');for(const [value,text] of values){const o=document.createElement('option');o.value=value;o.textContent=text;s.appendChild(o);}s.onchange=()=>Promise.resolve(callback(s.value)).catch(fail);bar.appendChild(s);return s;}
function check(text,value,callback,parent=bar){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=value;i.onchange=()=>callback(i.checked);l.append(i,document.createTextNode(text));parent.appendChild(l);return i;}
const bytes=Uint8Array.from(atob(cfg.data.split(',').pop()),c=>c.charCodeAt(0));
function snapshot(canvas){try{send('snapshot',{data:canvas.toDataURL('image/png')});}catch{}}
function ready(){clearTimeout(watchdog);status.textContent='';send('ready',{});}
function downloadSnapshot(table){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,420);ctx.fillStyle='#111';ctx.font='14px sans-serif';Array.from(table.rows).slice(0,18).forEach((row,i)=>ctx.fillText(Array.from(row.cells).map(c=>c.textContent).join('   ').slice(0,80),10,24+i*22));snapshot(canvas);
}
async function image(){
  const img=new Image();let zoom=1,base=1,width=0,height=0;
  const draw=()=>{img.style.width=width*base*zoom+'px';img.style.height=height*base*zoom+'px';};
  button('+',()=>{zoom=Math.min(16,zoom*1.4);draw();});button('−',()=>{zoom=Math.max(.1,zoom/1.4);draw();});button(label('reset'),()=>{zoom=1;draw();stage.scrollTo(0,0);});
  img.onload=()=>{if(width)return;width=img.naturalWidth;height=img.naturalHeight;base=Math.min(1,stage.clientWidth/width,(innerHeight-120)/height);draw();ready();};
  img.onerror=()=>fail(new Error(label('failed')));img.src=cfg.data;stage.appendChild(img);
}
async function pdf(){
  status.textContent=label('loadingPdfEngine');
  const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs');
  // Embedded WebViews cannot always spawn cross-origin module workers.
  globalThis.pdfjsWorker=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs');
  status.textContent=label('loadingPdfDocument');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs';
  const worker=new pdfjs.PDFWorker();await worker.promise;
  const task=pdfjs.getDocument({data:bytes,worker});
  const doc=await task.promise;let page=1,zoom=1,renderTask=null,renderVersion=0;
  const canvas=document.createElement('canvas');stage.appendChild(canvas);const counter=document.createElement('span');bar.appendChild(counter);
  async function render(){const version=++renderVersion;if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}}
    const p=await doc.getPage(page);if(version!==renderVersion)return;const original=p.getViewport({scale:1}),fit=Math.min(1,(stage.clientWidth-16)/original.width),viewport=p.getViewport({scale:fit*zoom*devicePixelRatio});
    canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=viewport.width/devicePixelRatio+'px';canvas.style.height=viewport.height/devicePixelRatio+'px';counter.textContent=page+' / '+doc.numPages;
    renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport});try{await renderTask.promise;}catch(e){if(e.name!=='RenderingCancelledException')throw e;}if(version!==renderVersion)return;ready();if(page===1&&zoom===1)snapshot(canvas);
  }
  button(label('previous'),()=>{page=Math.max(1,page-1);return render();});button(label('next'),()=>{page=Math.min(doc.numPages,page+1);return render();});
  button('+',()=>{zoom=Math.min(8,zoom*1.4);return render();});button('−',()=>{zoom=Math.max(.25,zoom/1.4);return render();});button(label('reset'),()=>{zoom=1;stage.scrollTo(0,0);return render();});await render();
}
async function workbook(){
  await script('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  const book=XLSX.read(bytes,{type:'array',dense:true});let sheet=book.SheetNames[0],row=0,column=0;
  const sheetSelect=select(book.SheetNames.map(name=>[name,name]),value=>{sheet=value;row=0;column=0;draw();});sheetSelect.setAttribute('aria-label',label('sheet'));
  const counter=document.createElement('span');bar.appendChild(counter);
  button(label('previousRows'),()=>{row=Math.max(0,row-200);draw();});button(label('nextRows'),()=>{row=Math.min(maxRow(),row+200);draw();});
  button(label('previousColumns'),()=>{column=Math.max(0,column-30);draw();});button(label('nextColumns'),()=>{column=Math.min(maxColumn(),column+30);draw();});
  const range=()=>XLSX.utils.decode_range(book.Sheets[sheet]['!ref']||'A1');
  const maxRow=()=>Math.floor(range().e.r/200)*200,maxColumn=()=>Math.floor(range().e.c/30)*30;
  function draw(){stage.replaceChildren();const ws=book.Sheets[sheet],bounds=range(),table=document.createElement('table'),head=table.insertRow();head.appendChild(document.createElement('th'));
    for(let c=column;c<=Math.min(bounds.e.c,column+29);c++){const th=document.createElement('th');th.textContent=XLSX.utils.encode_col(c);head.appendChild(th);}
    for(let r=row;r<=Math.min(bounds.e.r,row+199);r++){const tr=table.insertRow(),th=document.createElement('th');th.textContent=String(r+1);tr.appendChild(th);for(let c=column;c<=Math.min(bounds.e.c,column+29);c++){const cell=ws['!data']?.[r]?.[c]||ws[XLSX.utils.encode_cell({r,c})];const td=tr.insertCell();td.textContent=cell?XLSX.utils.format_cell(cell):'';}}
    stage.appendChild(table);counter.textContent=label('rows')+' '+(row+1)+'–'+Math.min(bounds.e.r+1,row+200)+' / '+(bounds.e.r+1)+'; '+label('columns')+' '+(column+1)+'–'+Math.min(bounds.e.c+1,column+30)+' / '+(bounds.e.c+1);ready();if(row===0&&column===0)downloadSnapshot(table);
  }draw();
}
async function scene(){
  const THREE=await import('three'),{OrbitControls}=await import('three/addons/controls/OrbitControls.js');
  stage.style.overflow='hidden';stage.style.touchAction='none';
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(stage.clientWidth,stage.clientHeight);stage.appendChild(renderer.domElement);
  const world=new THREE.Scene();world.background=new THREE.Color(cfg.background);
  const camera=new THREE.PerspectiveCamera(45,stage.clientWidth/stage.clientHeight,.01,10000000);camera.up.set(0,0,1);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  world.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(1,-1,2);world.add(light);
  const group=new THREE.Group();world.add(group);let initialPosition=null,initialTarget=null;
  function fit(){const box=new THREE.Box3().setFromObject(group);if(box.isEmpty())throw new Error(label('noGeometry'));const center=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.01),vf=THREE.MathUtils.degToRad(camera.fov),hf=2*Math.atan(Math.tan(vf/2)*camera.aspect),distance=radius/Math.sin(Math.min(vf,hf)/2)*1.15;
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.7,-.7,.6).normalize().multiplyScalar(distance));camera.near=Math.max(.001,distance/10000);camera.far=distance*100;camera.updateProjectionMatrix();controls.maxDistance=distance*20;controls.update();initialPosition=camera.position.clone();initialTarget=center.clone();}
  button('+',()=>{camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target);});button('−',()=>{camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target);});
  button(label('reset'),()=>{if(initialPosition){camera.position.copy(initialPosition);controls.target.copy(initialTarget);controls.update();}});
  let alive=true;function animate(){if(!alive)return;requestAnimationFrame(animate);controls.update();renderer.render(world,camera);}animate();window.addEventListener('pagehide',()=>{alive=false;controls.dispose();renderer.dispose();});
  new ResizeObserver(()=>{camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight);}).observe(stage);
  if(cfg.mode==='gcode') {
    const lines=new TextDecoder().decode(bytes).split(/\r?\n/),segments=[],features=new Set(),filaments=new Set();let pos={x:0,y:0,z:0,e:0},absolute=true,extrudeAbsolute=true,tool=0,feature='Unknown',width=.4,height=.2,layer=0,lastLayerZ=-1;
    const filamentColors=[];for(const line of lines){const match=line.match(/;\s*filament_colou?r\s*=\s*(.+)/i);if(match)filamentColors.push(...match[1].split(';').map(c=>c.trim()));}
    function segment(next,travel){if(next.x===pos.x&&next.y===pos.y&&next.z===pos.z){pos=next;return;}if(!travel&&next.z>lastLayerZ+.0001){lastLayerZ=next.z;layer++;}segments.push({a:[pos.x,pos.y,pos.z],b:[next.x,next.y,next.z],travel,tool,feature,width,height,layer});features.add(feature);filaments.add(tool);pos=next;}
    for(const raw of lines){const comment=raw.split(';').slice(1).join(';'),fm=comment.match(/(?:TYPE|FEATURE)\s*:\s*(.+)/i);if(fm)feature=fm[1].trim();const wm=comment.match(/WIDTH\s*:\s*([\d.]+)/i),hm=comment.match(/HEIGHT\s*:\s*([\d.]+)/i);if(wm)width=+wm[1];if(hm)height=+hm[1];
      const code=raw.split(';')[0].trim().toUpperCase(),cmd=code.match(/^([GMT]\d+)/)?.[1];if(!cmd)continue;if(cmd==='G90'){absolute=true;continue;}if(cmd==='G91'){absolute=false;continue;}if(cmd==='M82'){extrudeAbsolute=true;continue;}if(cmd==='M83'){extrudeAbsolute=false;continue;}if(cmd[0]==='T'){tool=+cmd.slice(1);continue;}
      const args={};for(const m of code.matchAll(/([XYZEFIJKR])\s*(-?\d*\.?\d+)/g))args[m[1].toLowerCase()]=+m[2];
      if(cmd==='G92'){Object.assign(pos,args);continue;}if(!['G0','G00','G1','G01','G2','G02','G3','G03'].includes(cmd))continue;
      const next={...pos};for(const axis of ['x','y','z'])if(args[axis]!==undefined)next[axis]=absolute?args[axis]:pos[axis]+args[axis];if(args.e!==undefined)next.e=extrudeAbsolute?args.e:pos.e+args.e;const travel=next.e<=pos.e||args.e===undefined;
      if(['G2','G02','G3','G03'].includes(cmd)&&('i'in args||'j'in args)){const start={...pos},cx=start.x+(args.i||0),cy=start.y+(args.j||0),r=Math.hypot(start.x-cx,start.y-cy),a=Math.atan2(start.y-cy,start.x-cx);let delta=Math.atan2(next.y-cy,next.x-cx)-a;const clockwise=cmd==='G2'||cmd==='G02';if(clockwise&&delta>=0)delta-=Math.PI*2;if(!clockwise&&delta<=0)delta+=Math.PI*2;const steps=Math.max(8,Math.ceil(Math.abs(delta)*r/.5));for(let s=1;s<=steps;s++){const f=s/steps;segment({...next,x:cx+r*Math.cos(a+delta*f),y:cy+r*Math.sin(a+delta*f),z:start.z+(next.z-start.z)*f,e:start.e+(next.e-start.e)*f},travel);}}
      else segment(next,travel);
    }
    if(!segments.length)throw new Error(label('noGeometry'));
    let mode='feature',showTravel=false,bottom=0,top=layer;const hiddenFeatures=new Set(),hiddenFilaments=new Set();const palette=['#4ade80','#60a5fa','#fb7185','#facc15','#c084fc','#22d3ee','#fb923c'];
    const ordered=Array.from(features),maxZ=segments.reduce((max,s)=>Math.max(max,s.b[2]),0);
    function draw(){while(group.children.length){const old=group.children.pop();old.geometry?.dispose();old.material?.dispose();}const positions=[],colors=[];for(const s of segments){if(s.layer<bottom||s.layer>top||s.travel&&!showTravel||hiddenFeatures.has(s.feature)||hiddenFilaments.has(s.tool))continue;let color;if(s.travel)color=new THREE.Color('#777777');else if(mode==='filament')color=new THREE.Color(filamentColors[s.tool]||palette[s.tool%palette.length]);else if(mode==='height')color=new THREE.Color().setHSL(.65*(1-s.b[2]/Math.max(maxZ,.001)),.8,.5);else if(mode==='width')color=new THREE.Color().setHSL(.65*(1-Math.min(s.width,1.2)/1.2),.8,.5);else color=new THREE.Color(palette[ordered.indexOf(s.feature)%palette.length]);positions.push(...s.a,...s.b);colors.push(color.r,color.g,color.b,color.r,color.g,color.b);}const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));group.add(new THREE.LineSegments(geom,new THREE.LineBasicMaterial({vertexColors:true})));renderer.render(world,camera);}
    select(['feature','filament','height','width'].map(key=>[key,label(key)]),value=>{mode=value;draw();});check(label('travel'),false,value=>{showTravel=value;draw();});
    for(const [text,initial,update] of [[label('bottom'),bottom,value=>bottom=value],[label('top'),top,value=>top=value]]){const l=document.createElement('label'),i=document.createElement('input');i.type='number';i.min=0;i.max=layer;i.value=initial;i.onchange=()=>{update(Math.min(layer,Math.max(0,+i.value)));draw();};l.append(text,i);bar.appendChild(l);}
    const filters=document.createElement('div');filters.id='filters';bar.appendChild(filters);for(const value of features)check(value,true,visible=>{visible?hiddenFeatures.delete(value):hiddenFeatures.add(value);draw();},filters);for(const value of filaments)check(label('filament')+' '+(value+1),true,visible=>{visible?hiddenFilaments.delete(value):hiddenFilaments.add(value);draw();},filters);
    draw();fit();ready();return;
  }
  const lower=cfg.filename.toLowerCase();
  if(/\.(step|stp)$/.test(lower)){
    const workerCode="importScripts('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js');onmessage=async(e)=>{try{const occt=await occtimportjs({locateFile:()=> 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm'});const r=occt.ReadStepFile(new Uint8Array(e.data),null);if(!r.success||!r.meshes.length)throw Error('No STEP geometry');postMessage({meshes:r.meshes});}catch(e){postMessage({error:e.message});}}";
    const url=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'})),worker=new Worker(url);let result;
    try{result=await new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data);worker.onerror=e=>reject(new Error(e.message));worker.postMessage(bytes.buffer);});}finally{worker.terminate();URL.revokeObjectURL(url);}
    for(const mesh of result.meshes){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.attributes.position.array,3));if(mesh.index)geometry.setIndex(mesh.index.array);geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:mesh.color?new THREE.Color(...mesh.color):0x60a5fa,side:THREE.DoubleSide}))); }
  }else if(lower.endsWith('.stl')){const {STLLoader}=await import('three/addons/loaders/STLLoader.js');group.add(new THREE.Mesh(new STLLoader().parse(bytes.buffer),new THREE.MeshStandardMaterial({color:0x60a5fa,side:THREE.DoubleSide})));
  }else if(lower.endsWith('.3mf')){
    // Production 3MFs reuse local IDs in separate model parts.
    await script('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
    const zip=await JSZip.loadAsync(bytes),parser=new DOMParser(),documents=new Map(),cache=new Map(),selected=cfg.plate||0;
    const normalize=path=>{const parts=[];for(const part of decodeURIComponent(path).replace(/\\/g,'/').split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return parts.join('/');};
    const actualPath=path=>Object.keys(zip.files).find(key=>key.toLowerCase()===normalize(path).toLowerCase());
    const pathAttribute=node=>Array.from(node.attributes).find(attribute=>attribute.localName==='path')?.value;
    function referencedPath(node,current){const path=pathAttribute(node);if(!path)return current;return actualPath(path.startsWith('/')?path:current.slice(0,current.lastIndexOf('/')+1)+path)||actualPath(path);}
    async function documentFor(path){if(!path||!zip.file(path))throw new Error(label('noGeometry'));if(!documents.has(path)){const doc=parser.parseFromString(await zip.file(path).async('string'),'application/xml');if(doc.querySelector('parsererror'))throw new Error(label('noGeometry'));documents.set(path,doc);}return documents.get(path);}
    function transform(node,object){const values=(node.getAttribute('transform')||'').trim().split(/\s+/).map(Number);if(values.length===12&&values.every(Number.isFinite))object.applyMatrix4(new THREE.Matrix4().set(values[0],values[3],values[6],values[9],values[1],values[4],values[7],values[10],values[2],values[5],values[8],values[11],0,0,0,1));}
    async function objectFor(path,id,ancestors=new Set()){
      const key=path+':'+id;if(ancestors.has(key))throw new Error(label('cyclicModel'));if(cache.has(key))return cache.get(key).clone(true);
      const doc=await documentFor(path),object=Array.from(doc.querySelectorAll('resources > object')).find(node=>node.getAttribute('id')===id);if(!object)throw new Error(label('noGeometry'));
      const result=new THREE.Group();result.name=object.getAttribute('name')||id;
      const mesh=Array.from(object.children).find(node=>node.localName==='mesh');
      if(mesh){const positions=[],indices=[];for(const vertex of mesh.querySelectorAll('vertices > vertex'))positions.push(+vertex.getAttribute('x'),+vertex.getAttribute('y'),+vertex.getAttribute('z'));for(const triangle of mesh.querySelectorAll('triangles > triangle'))indices.push(+triangle.getAttribute('v1'),+triangle.getAttribute('v2'),+triangle.getAttribute('v3'));
        if(!positions.length||!indices.length||positions.some(value=>!Number.isFinite(value))||indices.some(value=>!Number.isInteger(value)||value<0||value>=positions.length/3))throw new Error(label('noGeometry'));
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
        let color='#60a5fa';const materials=Array.from(doc.querySelectorAll('resources > basematerials')).find(node=>node.getAttribute('id')===object.getAttribute('pid'));if(materials){const base=materials.querySelectorAll('base')[+(object.getAttribute('pindex')||0)];if(base?.getAttribute('displaycolor'))color=base.getAttribute('displaycolor').slice(0,7);}
        result.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide})));
      }
      const next=new Set(ancestors);next.add(key);
      for(const component of object.querySelectorAll('components > component')){const child=await objectFor(referencedPath(component,path),component.getAttribute('objectid'),next);transform(component,child);result.add(child);}
      if(!result.children.length)throw new Error(label('noGeometry'));cache.set(key,result);return result.clone(true);
    }
    let mainPath=actualPath('3D/3dmodel.model');
    const relations=zip.file('_rels/.rels');if(relations){const doc=parser.parseFromString(await relations.async('string'),'application/xml'),relation=Array.from(doc.querySelectorAll('Relationship')).find(node=>(node.getAttribute('Type')||'').endsWith('/3dmodel'));if(relation)mainPath=actualPath(relation.getAttribute('Target'))||mainPath;}
    const main=await documentFor(mainPath),ids=new Set(),names=cfg.plates?.find(plate=>+plate.index===selected)?.objects||[],objectNames=new Map();
    const settings=zip.file('Metadata/model_settings.config');
    if(settings){const meta=parser.parseFromString(await settings.async('string'),'application/xml');for(const object of meta.querySelectorAll('config > object')){const name=Array.from(object.children).find(node=>node.getAttribute('key')==='name')?.getAttribute('value');if(name)objectNames.set(object.getAttribute('id'),name);}for(const plate of meta.querySelectorAll('plate')){const id=Array.from(plate.querySelectorAll('metadata')).find(node=>['plater_id','plate_id'].includes(node.getAttribute('key')))?.getAttribute('value');if(+id!==selected)continue;for(const object of plate.querySelectorAll('model_instance metadata[key="object_id"]'))ids.add(object.getAttribute('value'));}}
    if(selected&&!ids.size)for(const object of main.querySelectorAll('resources > object'))if(names.includes(object.getAttribute('name'))||names.includes(objectNames.get(object.getAttribute('id'))))ids.add(object.getAttribute('id'));
    const allItems=Array.from(main.querySelectorAll('build > item')),items=selected?allItems.filter(item=>ids.has(item.getAttribute('objectid'))||Array.from(item.attributes).some(attribute=>/(^|:)(plate_id|plater_id)$/.test(attribute.name)&&+attribute.value===selected)):allItems;
    if(!items.length)throw new Error(selected?label('plateUnavailable'):label('noGeometry'));
    for(const item of items){const object=await objectFor(referencedPath(item,mainPath),item.getAttribute('objectid'));transform(item,object);group.add(object);}
    const units={micron:.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000};group.scale.setScalar(units[main.documentElement.getAttribute('unit')]||1);
  }else throw new Error(label('unsupported'));
  let meshCount=0;group.traverse(object=>{if(object.isMesh)meshCount++;});renderer.domElement.dataset.meshCount=String(meshCount);
  fit();ready();renderer.render(world,camera);snapshot(renderer.domElement);
}
status.textContent=label('loading');
try{
  if(cfg.mode==='image')await image();
  else if(cfg.mode==='model'||cfg.mode==='gcode')await scene();
  else if(/\.pdf$/i.test(cfg.filename))await pdf();
  else await workbook();
}catch(error){fail(error);}
`;
