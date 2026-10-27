// macOS WebKit integration smoke test; all generated assets stay in the worktree.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const babel = require('@babel/core');
const Module = require('module');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.viewer-validation');
fs.mkdirSync(scratch, { recursive: true });
const filename = path.join(root, 'src/components/files/assetViewerHtml.ts');
const compiled = babel.transformFileSync(filename, {
  configFile: false, babelrc: false,
  presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const runtime = new Module(filename);
runtime._compile(compiled, filename);
const { assetViewerHtml } = runtime.exports;
function zip(entries) {
  let offset = 0;
  const local = [], central = [];
  for (const [name, content] of Object.entries(entries)) {
    const text = Buffer.from(content), nameBytes = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of text) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(text.length, 18); header.writeUInt32LE(text.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, text);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(text.length, 20); directory.writeUInt32LE(text.length, 24); directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes); offset += header.length + nameBytes.length + text.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(central);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const stl = 'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 20 0\nendloop\nendfacet\nendsolid triangle';
const mesh = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="20" y="0" z="0"/><vertex x="0" y="20" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>';
const model = zip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  '3D/3dmodel.model': `<?xml version="1.0"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model" name="First">${mesh}</object><object id="2" type="model" name="Second">${mesh}</object></resources><build><item objectid="1"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 40 0 0"/></build></model>`,
  'Metadata/model_settings.config': '<config><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate><plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="2"/></model_instance></plate></config>',
});
const workbook = zip({
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
  ...Object.fromEntries([1, 2].map(n => [`xl/worksheets/sheet${n}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Sheet ${n} content</t></is></c></row><row r="2"><c r="A2"><v>${n}</v></c></row></sheetData></worksheet>`])),
});
function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    ...[1, 2].map(n => { const content = `BT /F1 20 Tf 40 150 Td (Page ${n}) Tj ET`; return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`; }),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const start = body.length; body += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return body + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}
const labels = Object.fromEntries(['reset', 'previous', 'next', 'sheet', 'previousRows', 'nextRows', 'previousColumns', 'nextColumns', 'rows', 'columns', 'feature', 'filament', 'height', 'width', 'travel', 'bottom', 'top', 'allPlates', 'plate', 'failed', 'moduleFailed', 'noGeometry', 'plateUnavailable'].map(key => [key, key]));
const modelCheck = `await new Promise(r=>setTimeout(r,500)); const canvas=document.querySelector('canvas');if(!canvas||canvas.width<10||canvas.toDataURL().length<1000)throw Error('Missing rendered geometry');document.querySelector('button').click();return 'rendered scene, orbit canvas and zoom controls';`;
const cases = [];
function add(name, filename, mode, body, check, extra = {}) {
  cases.push({ name, html: assetViewerHtml({filename, mode, data: `data:application/octet-stream;base64,${Buffer.from(body).toString('base64')}`, labels, background: '#202020', foreground: '#ffffff', ...extra}), check });
}
add('STL', 'triangle.stl', 'model', stl, modelCheck);
add('3MF all plates', 'two.3mf', 'model', model, modelCheck);
add('3MF selected plate', 'two.3mf', 'model', model, modelCheck, {plate: 2, plates: [{index: 1, objects: ['First']}, {index: 2, objects: ['Second']}]});
const step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Planar triangle smoke fixture'),'2;1');
FILE_NAME('triangle.step','2026-01-01T00:00:00',('BambuBuddy'),('BambuBuddy'),'test','test','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=APPLICATION_CONTEXT('automotive design');
#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1);
#3=PRODUCT_CONTEXT('',#1,'mechanical');
#4=PRODUCT('triangle','triangle','',(#3));
#5=PRODUCT_DEFINITION_FORMATION('','',#4);
#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');
#7=PRODUCT_DEFINITION('design','',#5,#6);
#8=PRODUCT_DEFINITION_SHAPE('','',#7);
#9=SHAPE_DEFINITION_REPRESENTATION(#8,#10);
#10=MANIFOLD_SURFACE_SHAPE_REPRESENTATION('',(#11,#50),#60);
#11=AXIS2_PLACEMENT_3D('',#12,#13,#14);
#12=CARTESIAN_POINT('',(0.,0.,0.));
#13=DIRECTION('',(0.,0.,1.));
#14=DIRECTION('',(1.,0.,0.));
#50=SHELL_BASED_SURFACE_MODEL('',(#51));
#51=OPEN_SHELL('',(#52));
#52=FACE_SURFACE('',(#53),#54,.T.);
#53=FACE_OUTER_BOUND('',#55,.T.);
#54=PLANE('',#11);
#55=POLY_LOOP('',(#12,#56,#57));
#56=CARTESIAN_POINT('',(20.,0.,0.));
#57=CARTESIAN_POINT('',(0.,20.,0.));
#60=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#61)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#62,#63,#64)) REPRESENTATION_CONTEXT('',''));
#61=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#62,'distance_accuracy_value','confusion accuracy');
#62=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#63=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#64=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
ENDSEC;
END-ISO-10303-21;`;
add('STEP triangulation', 'triangle.step', 'model', step, modelCheck);
add('G-code controls', 'lines.gcode', 'gcode', '; filament_colour = #ff0000;#00ff00\nG90\nM82\nG1 X0 Y0 Z.2\n; FEATURE: Outer wall\nG1 X20 Y0 E1\nG1 X20 Y20 E2\nT1\n; FEATURE: Inner wall\nG1 Z.4\nG1 X0 Y20 E3\nG1 X0 Y0 E4\n', `${modelCheck.replace("return 'rendered scene, orbit canvas and zoom controls';", '')}const select=document.querySelector('select');for(const mode of ['filament','height','width']){select.value=mode;select.dispatchEvent(new Event('change'));}const toggles=document.querySelectorAll('input[type=checkbox]');if(toggles.length<5)throw Error('Missing feature/filament filters');toggles[0].click();return 'toolpaths, color modes, travel and material controls';`);
add('PDF two pages', 'sample.pdf', 'document', pdf(), `const counter=document.querySelector('#bar span');if(counter.textContent!=='1 / 2')throw Error('Bad PDF page count');Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='next').click();await new Promise(r=>setTimeout(r,500));if(counter.textContent!=='2 / 2')throw Error('Next page did not render');return 'PDF pages rendered and navigated';`);
add('CSV rows', 'sample.csv', 'document', 'name,value\nfirst,1\nsecond,2\n', `if(!document.querySelector('table').textContent.includes('second'))throw Error('CSV content missing');return 'CSV table rendered';`);
add('XLSX sheets', 'sample.xlsx', 'document', workbook, `const select=document.querySelector('select');if(select.options.length!==2)throw Error('Missing sheets');select.value='Second';select.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,100));if(!document.querySelector('table').textContent.includes('Sheet 2 content'))throw Error('Sheet switch failed');return 'both workbook sheets rendered';`);
const ods = zip({
  mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
  'META-INF/manifest.xml': '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>',
  'content.xml': '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet><table:table table:name="First"><table:table-row><table:table-cell office:value-type="string"><text:p>ODS content</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>',
});
add('ODS table', 'sample.ods', 'document', ods, `if(!document.querySelector('table').textContent.includes('ODS content'))throw Error('ODS content missing');return 'ODS table rendered';`);
add('Image zoom', 'sample.svg', 'image', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>', `const img=document.querySelector('img');if(!img.naturalWidth)throw Error('Image did not decode');const before=img.width;document.querySelector('button').click();await new Promise(r=>setTimeout(r,50));if(img.width<=before)throw Error('Image zoom failed');return 'image decoded and zoomed';`);
// SVG must retain its MIME type; native blobToDataUrl also preserves server MIME.
cases[cases.length - 1].html = cases[cases.length - 1].html.replace('data:application/octet-stream;base64,', 'data:image/svg+xml;base64,');
try {
  fs.writeFileSync(path.join(scratch, 'manifest.json'), JSON.stringify(process.argv[2] ? cases.filter(test => test.name.includes(process.argv[2])) : cases));
  const build = spawnSync('xcrun', ['swiftc', '-module-cache-path', path.join(scratch, 'cache'), path.join(__dirname, 'AssetViewerSmoke.swift'), '-o', path.join(scratch, 'smoke')], {stdio: 'inherit', env: {...process.env, TMPDIR: scratch}});
  if (build.status !== 0) process.exitCode = build.status || 1;
  else {
    const result = spawnSync(path.join(scratch, 'smoke'), [path.join(scratch, 'manifest.json')], {stdio: 'inherit', timeout: 900000});
    process.exitCode = result.status ?? 1;
    if (result.error) console.error(result.error.message);
  }
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}
