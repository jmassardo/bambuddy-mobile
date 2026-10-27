/* Inventory only app-authored UI positions. Never execute application modules. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const project = path.resolve(__dirname, '..');
const sourceRoot = path.join(project, 'src');
const locales = ['en', 'de', 'es', 'fr', 'ja', 'it', 'ko', 'nl', 'pt-BR', 'zh-CN', 'zh-TW', 'sv', 'tr', 'ru', 'uk'];
const uiProperties = /^(title|label|subtitle|placeholder|message|description|helper|helperText|error|hint|accessibilityLabel|accessibilityHint|confirmLabel|cancelLabel|dismissLabel|emptyTitle|emptyMessage|buttonText|prefix|suffix|text)$/;
const technicalLiterals = new Set([
  'AMS', 'AMS HT', 'AMS Pro', 'AMS 2 Pro', 'NFC', 'RFID', 'QR', 'QR Code', 'API', 'API Key', 'IP',
  'MQTT', 'HTTP', 'HTTPS', 'FTP', 'FTPS', 'RTSP', 'RTSPS', 'MJPEG', 'TCP', 'UDP', 'LAN', 'Wi-Fi',
  'JSON', 'CSV', 'GCODE', 'G-Code', '3MF', 'STL', 'OBJ', 'STEP', 'PNG', 'JPEG', 'JPG', 'MP4',
  'PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PVA', 'HIPS', 'PET', 'PPS', 'PEEK', 'PEKK',
  'SMTP', 'SSL', 'TLS', 'STARTTLS', 'LDAP', 'OIDC', 'OAuth', 'OAuth2', '2FA', 'TOTP', 'URI', 'URL',
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'INR', 'HKD', 'KRW', 'SEK', 'NOK',
  'DKK', 'PLN', 'BRL', 'TWD', 'SGD', 'NZD', 'MXN', 'BZD', 'MYR', 'CZK', 'THB', 'ZAR', 'TRY',
  'RUB', 'HUF', 'ILS', 'UAH', 'IDR', 'PHP', 'GB', 'MB', 'KB', 'mm', 'cm', 'kg', 'g', 'kWh',
  'W', 'V', 'A', 'Hz', 'FPS', 'mm/s', 'mm³/s', '°C', '°F', 'HH:MM', 'HH:mm', 'MM/DD/YYYY',
  'DD/MM/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'K', 'N', 'BambuBuddy', 'BamBuddy', 'Bambu Lab',
  'Bambu Studio', 'OrcaSlicer', 'PrusaSlicer', 'SuperSlicer', 'SpoolBuddy', 'Spoolman', 'Tasmota',
  'Home Assistant', 'Prometheus', 'Grafana', 'Obico', 'GitHub', 'Google', 'Apple', 'Android',
  'iOS', 'Telegram', 'Discord', 'Slack', 'Pushover', 'Pushbullet', 'Gotify', 'ntfy', 'Apprise',
  'Face ID', 'Touch ID', 'X1', 'X1C', 'X1E', 'X2D', 'P1P', 'P1S', 'P2S', 'A1', 'A1 mini',
  'H2D', 'H2D Pro', 'H2C', 'H2S', 'H2D Pro', 'H2S Pro', 'Beta', 'Alpha',
]);

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}
function literal(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}
function unparen(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function propertyName(node, file) {
  return literal(node) ? node.text : node.getText(file);
}
function owningName(node, file) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.text;
    if ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && ts.isVariableDeclaration(parent.parent)) return parent.parent.name.getText(file);
    if (ts.isVariableDeclaration(parent)) return parent.name.getText(file);
  }
  return 'module';
}
function jsxWhitespace(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  return lines.map((line, index) => {
    const expanded = line.replace(/\t/g, ' ');
    return (index ? expanded.replace(/^ +/, '') : expanded).replace(index < lines.length - 1 ? / +$/ : /$^/, '');
  }).filter(line => line.length).join(' ');
}
function decodeEntities(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, match => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': '\u00a0' };
    if (named[match]) return named[match];
    return String.fromCodePoint(match.startsWith('&#x') ? parseInt(match.slice(3, -1), 16) : Number(match.slice(2, -1)));
  });
}
function exclusion(text) {
  if (!/[A-Za-z]/.test(text.replace(/\{\{\w+\}\}/g, ''))) return 'Only interpolated data, structural punctuation, numeric values or symbols; not English prose.';
  if (technicalLiterals.has(text)) return 'Product/protocol/material identifier, currency code, format pattern or literal unit; preserve exactly.';
  if (/^(?:https?:|rtsp:|rtsps:|bambuddy:|mailto:|\/api\/|\/dev\/)/i.test(text) || /^[\w.+-]+@[\w.-]+\.[a-z]+$/i.test(text)) return 'URL, address or protocol example; preserve exactly.';
  if (/^#[\da-f]{3,8}$/i.test(text) || /^[\d.,+\-– /]*[a-zA-Z]{1,3}(?:\/s)?$/.test(text)) return 'Color literal or numeric measurement/size example; preserve exactly.';
  if (/^\*?\.[a-z\d., *]+$/i.test(text) || /^(?:[a-z\d_-]+\.)+(?:local|com|org|net|cool)$/i.test(text)) return 'Filename pattern or host example; preserve exactly.';
  if (/^[A-Z]\d[A-Z\d]*(?: (?:Pro|mini))?$/.test(text)) return 'Hardware model identifier; preserve exactly.';
  return null;
}

function loadExistingCatalogs() {
  const cache = {};
  function load(name) {
    const filename = path.join(sourceRoot, 'i18n', `${name}.ts`);
    if (cache[filename]) return cache[filename];
    const exports = {};
    cache[filename] = exports;
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require(request) {
        if (request === './nativeCatalog') return load('nativeCatalog');
        throw new Error(`Catalog inventory cannot execute dependency ${request}`);
      },
    }, { filename });
    return exports;
  }
  return load('catalog').catalogs;
}

function extractInventory() {
  const catalogs = loadExistingCatalogs();
  const existingEnglish = new Map();
  for (const [key, english] of Object.entries(catalogs.en)) {
    if (locales.every(locale => typeof catalogs[locale]?.[key] === 'string')) existingEnglish.set(english, key);
  }
  const entries = new Map();
  const excluded = [];
  const review = [];
  const seen = new Set();
  const positions = new Set();
  const files = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['__tests__', 'i18n'].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(filename);
      else if (/\.tsx?$/.test(filename) && !filename.endsWith('.d.ts')) files.push(filename);
    }
  }
  collect(sourceRoot);
  for (const filename of files) {
    const relative = path.relative(project, filename);
    const content = fs.readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
    const reserved = relative.startsWith('src/navigation/') || relative === 'src/screens/MoreScreen.tsx';
    const variables = new Map();
    const wrappers = new Map();
    visit(file, node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const values = variables.get(node.name.text) ?? [];
        values.push(node);
        variables.set(node.name.text, values);
        const initializer = unparen(node.initializer);
        if (ts.isCallExpression(initializer) && initializer.expression.getText(file) === 'useIntegrationTranslation') wrappers.set(node.name.text, 0);
      }
      if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node) && !ts.isFunctionDeclaration(node)) return;
      const owner = ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(file) : node.name?.getText(file);
      if (!owner || !node.body) return;
      visit(node.body, child => {
        if (!ts.isCallExpression(child) || !/(?:^|\.)t$/.test(child.expression.getText(file))) return;
        const options = child.arguments[1];
        if (!options || !ts.isObjectLiteralExpression(options)) return;
        const fallback = options.properties.find(property => ts.isPropertyAssignment(property) && propertyName(property.name, file) === 'defaultValue');
        if (!fallback || !ts.isIdentifier(fallback.initializer)) return;
        const index = node.parameters.findIndex(parameter => parameter.name.getText(file) === fallback.initializer.text);
        if (index >= 0) wrappers.set(owner, index);
      });
    });
    function finiteValues(input, depth = 0) {
      const node = unparen(input);
      if (!node || depth > 8) return [];
      if (literal(node)) return [node.text];
      if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(element => finiteValues(element, depth + 1));
      if (ts.isConditionalExpression(node)) return [...finiteValues(node.whenTrue, depth + 1), ...finiteValues(node.whenFalse, depth + 1)];
      if (ts.isIdentifier(node)) {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (ts.isArrowFunction(parent) && parent.parameters.some(parameter => parameter.name.getText(file) === node.text) &&
              ts.isCallExpression(parent.parent) && ts.isPropertyAccessExpression(parent.parent.expression) && parent.parent.expression.name.text === 'map') {
            return finiteValues(parent.parent.expression.expression, depth + 1);
          }
        }
        const declaration = (variables.get(node.text) ?? []).filter(item => item.pos < node.pos).at(-1);
        if (declaration) return finiteValues(declaration.initializer, depth + 1);
      }
      if (ts.isTemplateExpression(node)) {
        let results = [node.head.text];
        for (const span of node.templateSpans) {
          const values = finiteValues(span.expression, depth + 1);
          if (!values.length) return [];
          results = results.flatMap(prefix => values.map(value => prefix + value + span.literal.text));
          if (results.length > 200) return [];
        }
        return results;
      }
      return [];
    }
    function occurrence(node, kind, extra = {}) {
      const position = file.getLineAndCharacterOfPosition(node.getStart(file));
      return {
        file: relative, line: position.line + 1, column: position.character + 1,
        start: node.getStart(file), end: node.end, kind, owner: owningName(node, file),
        reserved, source: node.getText(file).slice(0, 250), ...extra,
      };
    }
    function report(node, english, kind, extra = {}) {
      if (!english.trim()) return;
      const identity = `${relative}:${node.pos}:${kind}:${english}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      const ref = occurrence(node, kind, extra);
      positions.add(`${relative}:${ref.start}`);
      const reason = exclusion(english.trim());
      if (reason) { excluded.push({ english, reason, ...ref }); return; }
      const context = 'shared';
      const canonical = `${context}\0${english}`;
      const existingKey = existingEnglish.get(english);
      const key = existingKey ?? `native.${digest(canonical).slice(0, 16)}`;
      if (!entries.has(canonical)) {
        entries.set(canonical, {
          key, english, context, placeholders: [...new Set([...english.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort(),
          ...(existingKey ? { existingCatalogKey: existingKey } : {}),
          occurrences: [],
        });
      }
      entries.get(canonical).occurrences.push(ref);
    }
    function template(node) {
      if (literal(node)) return { english: node.text, bindings: [] };
      if (!ts.isTemplateExpression(node)) return null;
      let english = node.head.text;
      const bindings = [];
      for (const span of node.templateSpans) {
        const name = `value${bindings.length}`;
        bindings.push({ name, expression: span.expression.getText(file) });
        english += `{{${name}}}${span.literal.text}`;
      }
      return { english, bindings };
    }
    function uiExpression(input, kind, extra = {}) {
      const node = unparen(input);
      if (!node) return;
      const value = template(node);
      if (value) {
        report(node, value.english, kind, { ...extra, ...(value.bindings.length ? { bindings: value.bindings } : {}) });
        if (ts.isTemplateExpression(node)) for (const span of node.templateSpans) uiExpression(span.expression, 'embedded-template-choice', extra);
        return;
      }
      if (ts.isConditionalExpression(node)) {
        uiExpression(node.whenTrue, kind, extra); uiExpression(node.whenFalse, kind, extra);
      } else if (ts.isBinaryExpression(node)) {
        if ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) uiExpression(node.right, kind, extra);
        else if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          const pieces = [];
          function flatten(expression) {
            const part = unparen(expression);
            if (ts.isBinaryExpression(part) && part.operatorToken.kind === ts.SyntaxKind.PlusToken) {
              flatten(part.left); flatten(part.right);
            } else pieces.push(part);
          }
          flatten(node);
          if (pieces.some(part => literal(part) && /[A-Za-z]/.test(part.text))) {
            let english = '';
            const bindings = [];
            for (const piece of pieces) {
              if (literal(piece)) english += piece.text;
              else { const name = `value${bindings.length}`; bindings.push({ name, expression: piece.getText(file) }); english += `{{${name}}}`; }
            }
            report(node, english, kind, { ...extra, bindings });
          }
        }
      }
    }
    visit(file, node => {
      if (ts.isJsxText(node)) report(node, decodeEntities(jsxWhitespace(node.text)), 'jsx-text');
      if (ts.isJsxAttribute(node) && uiProperties.test(node.name.getText(file)) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) report(node.initializer, decodeEntities(node.initializer.text), 'jsx-attribute', { attribute: node.name.getText(file) });
        else if (ts.isJsxExpression(node.initializer)) uiExpression(node.initializer.expression, 'jsx-attribute-expression', { attribute: node.name.getText(file) });
      }
      if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        uiExpression(node.expression, 'jsx-expression');
        if (node.expression) visit(node.expression, child => {
          if (ts.isArrayLiteralExpression(child) && ts.isPropertyAccessExpression(child.parent) && child.parent.name.text === 'map') {
            child.elements.filter(literal).forEach(element => report(element, element.text, 'finite-display-choice', { manualMigration: true }));
          }
        });
      }
      if (ts.isPropertyAssignment(node) && uiProperties.test(propertyName(node.name, file))) {
        // A notification body/default form value is user-editable content, not a native label.
        uiExpression(node.initializer, 'ui-object-label', { property: propertyName(node.name, file) });
      }
      if ((ts.isBindingElement(node) || ts.isParameter(node)) && node.initializer && uiProperties.test(node.name.getText(file))) {
        uiExpression(node.initializer, 'ui-default-prop');
      }
      if (ts.isArrayLiteralExpression(node) && node.elements.length >= 2 && literal(node.elements[0]) && literal(node.elements[1]) &&
          ts.isArrayLiteralExpression(node.parent) && node.parent.elements.every(element => ts.isArrayLiteralExpression(element))) {
        report(node.elements[1], node.elements[1].text, 'ui-label-tuple', { manualMigration: true });
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /(?:title|label|message|description|placeholder|hint|text|error|warning|help)$/i.test(node.name.text)) {
        uiExpression(node.initializer, 'ui-label-binding');
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /(?:labels?|titles?|descriptions?|messages?|tooltips?|displayNames)$/i.test(node.name.text)) {
        const value = unparen(node.initializer);
        if (value && ts.isObjectLiteralExpression(value)) for (const property of value.properties) {
          if (ts.isPropertyAssignment(property)) uiExpression(property.initializer, 'ui-label-dictionary', { dictionary: node.name.text });
        }
      }
      if (ts.isReturnStatement(node) && node.expression) {
        const owner = owningName(node, file);
        const values = finiteValues(node.expression);
        if (/validate|validation|label|title|status|hint|description|message|summary|display|format/i.test(owner) || values.some(value => /^[A-Z][a-z]+(?:[ .!?]|$)/.test(value))) {
          uiExpression(node.expression, 'ui-helper-return', { helper: owner });
        }
      }
      if (ts.isNewExpression(node) && /^(Error|ApiError)$/.test(node.expression.getText(file))) {
        node.arguments?.slice(0, 1).forEach(argument => uiExpression(argument, 'app-error'));
      }
      if (!ts.isCallExpression(node)) return;
      const name = node.expression.getText(file);
      if (/(?:^|\.)t$/.test(name)) {
        const options = node.arguments[1];
        const fallback = options && ts.isObjectLiteralExpression(options) && options.properties.find(property => ts.isPropertyAssignment(property) && propertyName(property.name, file) === 'defaultValue');
        if (fallback) {
          const defaults = finiteValues(fallback.initializer);
          const keys = finiteValues(node.arguments[0]);
          if (defaults.length) {
            for (const [index, english] of defaults.entries()) {
              report(fallback.initializer, english, 'translation-default', { existingKey: keys.length === defaults.length ? keys[index] : keys[0], ...(defaults.length > 1 ? { finiteDefaults: defaults } : {}) });
            }
          } else {
            uiExpression(fallback.initializer, 'translation-default-template', { existingKey: keys[0] });
            review.push({ ...occurrence(node, 'dynamic-translation-default'), reason: 'Resolve app-authored validator/conditional defaults or distinguish server/user data. Never translate arbitrary error content.' });
          }
        } else {
          const keys = finiteValues(node.arguments[0]);
          for (const key of keys) {
            if (catalogs.en[key]) report(node, catalogs.en[key], 'existing-translation-key', { existingKey: key });
            else review.push({ ...occurrence(node, 'unknown-translation-key'), key, reason: 'No existing English value; explicitly resolve before completeness can pass.' });
          }
        }
      } else if (wrappers.has(name)) {
        uiExpression(node.arguments[wrappers.get(name)], 'wrapped-translation-default', { wrapper: name });
      } else if (name === 'Object.entries' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        for (const property of node.arguments[0].properties) if (ts.isPropertyAssignment(property)) {
          uiExpression(property.initializer, 'ui-entry-dictionary', { manualMigration: true });
        }
      } else if (/errorMessage|ErrorMessage|errorText|ErrorText|parseError|formatError|errorToMessage|mutationError/i.test(name)) {
        node.arguments.forEach(argument => uiExpression(argument, 'app-error-fallback'));
      } else if (/(?:showToast|showError|showSuccess|setError|setMessage|setStatusMessage|showAlert|showConfirm|confirmAction|Alert\.alert)$/.test(name)) {
        node.arguments.slice(0, name === 'Alert.alert' ? 2 : 1).forEach(argument => uiExpression(argument, 'feedback-message'));
      } else if (/^render(?:\w*)(?:Field|Stat|Metric|Setting|Toggle|Section|Info|Label|Button|Row)$/.test(name)) {
        node.arguments.slice(0, 1).forEach(argument => uiExpression(argument, 'helper-label-argument', { manualMigration: true }));
      }
    });
    // Include whole JSX text+value templates for grammatical reordering, in addition to
    // independently useful labels. Migration chooses the whole template, not fragments.
    visit(file, node => {
      if (!ts.isJsxElement(node) || node.children.length < 2) return;
      if (node.children.some(child => !ts.isJsxText(child) && !ts.isJsxExpression(child))) return;
      let english = '';
      const bindings = [];
      for (const child of node.children) {
        if (ts.isJsxText(child)) english += decodeEntities(jsxWhitespace(child.text));
        else if (child.expression) {
          if (literal(child.expression)) english += child.expression.text;
          else {
            const name = `value${bindings.length}`;
            bindings.push({ name, expression: child.expression.getText(file) });
            english += `{{${name}}}`;
          }
        }
      }
      if (bindings.length && /[A-Za-z]/.test(english.replace(/\{\{\w+\}\}/g, ''))) {
        report(node, english, 'jsx-compound-template', {
          bindings, childrenStart: node.openingElement.end, childrenEnd: node.closingElement.getStart(file),
          manualMigration: true,
        });
      }
    });
    // Surface residual prose rather than silently dropping indirect error/default
    // labels. These require explicit source review before a migration can pass.
    visit(file, node => {
      if (!literal(node) || !/[A-Za-z] [A-Za-z]/.test(node.text) || existingEnglish.has(node.text)) return;
      if (ts.isLiteralTypeNode(node.parent) || ts.isImportDeclaration(node.parent) || ts.isTaggedTemplateExpression(node.parent)) return;
      if (/^(?:\s*<[\w!]|[\s\S]*\b(?:document\.|window\.|function\s+\w+\s*\())/.test(node.text)) return;
      if (ts.isCallExpression(node.parent) && /^(?:console\.|logger\.|log\.)/.test(node.parent.expression.getText(file))) return;
      if (positions.has(`${relative}:${node.getStart(file)}`)) return;
      if (relative === 'src/api/http.ts') {
        excluded.push({ english: node.text, reason: 'HTTP protocol/authentication matching or diagnostic string; do not mutate wire semantics.', ...occurrence(node, 'protocol-prose') });
        return;
      }
      report(node, node.text, 'indirect-app-prose', { manualMigration: true });
    });
  }
  for (const addition of JSON.parse(fs.readFileSync(path.join(__dirname, 'native-translation-additions.json'), 'utf8'))) {
    const canonical = `shared\0${addition.english}`;
    if (!entries.has(canonical)) {
      const existingCatalogKey = existingEnglish.get(addition.english);
      entries.set(canonical, {
        key: existingCatalogKey ?? `native.${digest(canonical).slice(0, 16)}`, english: addition.english, context: 'shared',
        placeholders: [...new Set([...addition.english.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort(),
        ...(existingCatalogKey ? { existingCatalogKey } : {}), occurrences: [],
      });
    }
    entries.get(canonical).occurrences.push({
      file: addition.file, line: 0, column: 0, kind: 'coordinated-source-addition',
      existingKey: addition.key, owner: path.basename(addition.file, '.tsx'),
      reserved: false, source: 'Coordinated source-entry branch; reconcile after parent cherry-pick.',
    });
  }
  const sorted = [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
  const resources = sorted.filter(entry => !entry.existingCatalogKey);
  for (const [index, entry] of resources.entries()) entry.chunk = String(Math.floor(index / 150) + 1).padStart(4, '0');
  const canonical = resources.map(({ key, english, context, placeholders, chunk }) => ({ key, english, context, placeholders, chunk }));
  return {
    schemaVersion: 1,
    sourceCommit: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim(),
    locales, chunkSize: 150,
    digestAlgorithm: 'sha256(JSON.stringify(resource entries sorted by key; fields key,english,context,placeholders,chunk))',
    resourceDigest: digest(JSON.stringify(canonical)),
    stats: { entries: sorted.length, newResourceKeys: resources.length, reusedCatalogKeys: sorted.length - resources.length, occurrences: sorted.reduce((sum, entry) => sum + entry.occurrences.length, 0), chunks: Math.ceil(resources.length / 150), excluded: excluded.length, review: review.length },
    entries: sorted, excluded, review,
  };
}

function writeInventory(inventory, target) {
  const directory = path.join(sourceRoot, 'i18n', 'resources', 'en');
  fs.mkdirSync(directory, { recursive: true });
  const chunks = new Map();
  for (const entry of inventory.entries.filter(item => item.chunk)) {
    const chunk = chunks.get(entry.chunk) ?? {};
    chunk[entry.key] = entry.english;
    chunks.set(entry.chunk, chunk);
  }
  for (const [chunk, values] of chunks) {
    const filename = path.join(directory, `${chunk}.json`);
    const json = JSON.stringify(values, null, 2) + '\n';
    if (fs.existsSync(filename) && fs.readFileSync(filename, 'utf8') !== json && !process.argv.includes('--replace-unassigned')) throw new Error(`Frozen resource chunk differs: ${filename}. Do not silently renumber assigned translations.`);
    fs.writeFileSync(filename, json);
  }
  const contextsDirectory = path.join(sourceRoot, 'i18n', 'resources', 'contexts');
  fs.mkdirSync(contextsDirectory, { recursive: true });
  for (const [chunk] of chunks) {
    const contexts = Object.fromEntries(inventory.entries.filter(entry => entry.chunk === chunk).map(entry => [entry.key, {
      english: entry.english, context: entry.context, placeholders: entry.placeholders,
      occurrences: entry.occurrences.map(({ file, line, kind, owner, source, existingKey }) => ({
        file, line, kind, owner, ...(existingKey ? { existingKey } : {}), source,
      })),
    }]));
    fs.writeFileSync(path.join(contextsDirectory, `${chunk}.json`), JSON.stringify(contexts, null, 2) + '\n');
  }
  const manifest = {
    schemaVersion: inventory.schemaVersion, sourceCommit: inventory.sourceCommit, resourceDigest: inventory.resourceDigest,
    locales, chunkSize: inventory.chunkSize, resourceCount: inventory.stats.newResourceKeys,
    chunks: [...chunks.keys()],
  };
  fs.writeFileSync(path.join(sourceRoot, 'i18n', 'resources', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(target, JSON.stringify(inventory, null, 2) + '\n');
}
if (require.main === module) {
  const inventory = extractInventory();
  const index = process.argv.indexOf('--inventory');
  if (index >= 0) writeInventory(inventory, path.resolve(process.argv[index + 1]));
  console.log(JSON.stringify({ resourceDigest: inventory.resourceDigest, ...inventory.stats }, null, 2));
}
module.exports = { extractInventory, writeInventory, loadExistingCatalogs, exclusion, jsxWhitespace, decodeEntities, digest, locales };
