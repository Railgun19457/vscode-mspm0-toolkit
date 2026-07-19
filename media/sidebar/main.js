const vscode = acquireVsCodeApi();
let state = null;
let suppress = false;
let allDevices = [];
let selectedDevice = '';
let currentPage = 'console';

const $ = (id) => document.getElementById(id);
const toolKeys = ['gcc', 'sdk', 'sysconfig', 'jlink', 'openocd', 'make'];

/** Plugin settings fields: id <-> host key, with type for read/write. */
const SETTINGS = [
  { id: 'optAutoSyscfg', key: 'autoSyscfgOnBuild', type: 'bool' },
  { id: 'optBuildBeforeFlash', key: 'buildBeforeFlash', type: 'bool', defaultTrue: true },
  { id: 'optBuildBeforeDebug', key: 'buildBeforeDebug', type: 'bool', defaultTrue: true },
  { id: 'optAutoDetectStartup', key: 'autoDetectOnStartup', type: 'bool', defaultTrue: true },
  { id: 'optOpenOutputOnError', key: 'openOutputOnError', type: 'bool' },
  { id: 'optAutoSwitchProject', key: 'autoSwitchProject', type: 'bool', defaultTrue: true },
  { id: 'optBuildJobs', key: 'buildJobs', type: 'number', fallback: 8 },
  { id: 'optSerialBaud', key: 'serialBaudRate', type: 'number', fallback: 115200 },
  { id: 'optToolScope', key: 'toolPathScope', type: 'select', map: (v) => (v === 'workspace' ? 'workspace' : 'user') },
  { id: 'optDefaultDevice', key: 'defaultDevice', type: 'text' },
  { id: 'optDefaultProbe', key: 'defaultProbe', type: 'select', fallback: 'jlink' },
];

/** Buttons: availability key (from actions) + click message. enabled:true = always when not busy. */
const BUTTONS = [
  { id: 'btnInit', actionKey: 'initProject', msg: 'initProject' },
  { id: 'btnSync', actionKey: 'syncConfig', msg: 'syncConfig' },
  { id: 'btnBuild', actionKey: 'build', run: 'build' },
  { id: 'btnClean', actionKey: 'clean', run: 'clean' },
  { id: 'btnFlash', actionKey: 'flash', run: 'flash' },
  { id: 'btnSysGui', actionKey: 'syscfgGui', run: 'syscfgGui' },
  { id: 'btnSysGen', actionKey: 'syscfgGen', run: 'syscfgGen' },
  { id: 'btnDebug', actionKey: 'debug', run: 'debug' },
  { id: 'btnHealth', actionKey: 'healthCheck', msg: 'healthCheck' },
  { id: 'btnCreate', actionKey: 'createProject', msg: 'createProject' },
  { id: 'btnForceDetect', actionKey: 'forceDetect', msg: 'forceDetect' },
  { id: 'btnSerial', actionKey: 'openSerial', msg: 'openSerial' },
  { id: 'btnDetect', always: true, msg: 'autoDetect' },
  { id: 'btnDoctor', always: true, msg: 'doctor' },
  { id: 'btnPickFolder', needsWs: true, msg: 'pickProjectFolder' },
  { id: 'btnRefreshProjects', needsWs: true, msg: 'refreshProjects' },
];

function post(type, payload) {
  vscode.postMessage(payload === undefined ? { type } : { type, payload });
}

function setMsg(text, level) {
  const el = $('message');
  if (!el) return;
  if (!text) {
    el.className = 'msg hidden';
    el.textContent = '';
    return;
  }
  el.className = 'msg ' + (level || 'info');
  el.textContent = text;
}

function statusMark(status) {
  if (status === 'ok') return { className: 'mark ok', symbol: '✓' };
  if (status === 'error') return { className: 'mark err', symbol: '!' };
  if (status === 'warn') return { className: 'mark warn', symbol: '!' };
  return { className: 'mark', symbol: '?' };
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v == null) return;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.keys(v).forEach((d) => { node.dataset[d] = v[d]; });
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    });
  }
  (children || []).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

function stripMspm0(id) {
  return String(id || '').replace(/^MSPM0/, '');
}

function normalizeDeviceQuery(q) {
  return String(q || '').trim().toUpperCase().replace(/\s+/g, '');
}

function deviceMatches(d, query) {
  if (!query) return true;
  const id = normalizeDeviceQuery(d.id);
  const series = normalizeDeviceQuery(d.series || '');
  const family = normalizeDeviceQuery(d.family || '');
  const bare = stripMspm0(id);
  const qBare = stripMspm0(query);
  return (
    id.includes(query) ||
    bare.includes(query) ||
    bare.includes(qBare) ||
    series.includes(query) ||
    family.includes(query) ||
    'MSPM0' + query === id
  );
}

function fillDeviceDatalist(filterText) {
  const datalist = $('deviceDatalist');
  if (!datalist) return;
  const q = normalizeDeviceQuery(filterText);
  const list = (allDevices || []).filter((d) => deviceMatches(d, q)).slice(0, 80);
  datalist.innerHTML = '';
  list.forEach((d) => {
    datalist.appendChild(
      el('option', {
        value: d.id,
        label: d.series ? d.id + ' (' + d.series + ')' : d.id,
      })
    );
  });
}

function resolveDevice(raw) {
  const typed = String(raw || '').trim();
  if (!typed) return undefined;
  const q = normalizeDeviceQuery(typed);
  const list = allDevices || [];
  const exact = list.find((d) => normalizeDeviceQuery(d.id) === q);
  if (exact) return exact;
  const matches = list.filter((d) => deviceMatches(d, q));
  if (matches.length === 1) return matches[0];
  const bareMatches = list.filter((d) => stripMspm0(normalizeDeviceQuery(d.id)) === stripMspm0(q));
  if (bareMatches.length === 1) return bareMatches[0];
  return undefined;
}

function commitDevice(raw, silent) {
  if (suppress) return;
  const hit = resolveDevice(raw);
  const input = $('device');
  if (!hit) {
    if (!silent) setMsg('未知芯片型号: ' + String(raw || '').trim(), 'error');
    fillDeviceDatalist(raw);
    return;
  }
  selectedDevice = hit.id;
  if (input) input.value = hit.id;
  fillDeviceDatalist('');
  emitTarget(true);
}

function setBusy(busyText) {
  const elBusy = $('busyBadge');
  if (!elBusy) return;
  if (busyText) {
    elBusy.textContent = 'Busy: ' + busyText;
    elBusy.classList.remove('hidden');
  } else {
    elBusy.classList.add('hidden');
  }
}

function applyPage(page) {
  currentPage = page === 'settings' ? 'settings' : 'console';
  const isConsole = currentPage === 'console';
  $('pageConsole')?.classList.toggle('active', isConsole);
  $('pageSettings')?.classList.toggle('active', !isConsole);
  $('tabConsole')?.classList.toggle('active', isConsole);
  $('tabSettings')?.classList.toggle('active', !isConsole);
}

function applySettings(st) {
  const src = st || {};
  SETTINGS.forEach((field) => {
    const node = $(field.id);
    if (!node) return;
    const raw = src[field.key];
    if (field.type === 'bool') {
      node.checked = field.defaultTrue ? raw !== false : !!raw;
    } else if (field.type === 'number') {
      node.value = String(raw != null ? raw : field.fallback);
    } else if (field.type === 'select' && field.map) {
      node.value = field.map(raw);
    } else {
      node.value = raw != null && raw !== '' ? String(raw) : field.fallback || '';
    }
  });
}

function bindSettings() {
  SETTINGS.forEach((field) => {
    const node = $(field.id);
    if (!node) return;
    node.addEventListener('change', (e) => {
      if (suppress) return;
      let value;
      if (field.type === 'bool') value = !!e.target.checked;
      else if (field.type === 'number') value = Number(e.target.value || field.fallback || 0);
      else if (field.key === 'defaultDevice') value = String(e.target.value || '').trim();
      else value = e.target.value;
      post('setPluginSetting', { key: field.key, value });
    });
  });
}

function setBadge(id, text, level) {
  const node = $(id);
  if (!node) return;
  node.textContent = text;
  node.className = 'badge ' + (level || '');
}

function renderProjectList(s, project, target) {
  const listEl = $('projectList');
  const countEl = $('projectCount');
  const folders = s.workspaceFolders || [];
  const current = s.workspaceFolder || project.root || '';
  const currentN = normPath(current);
  const initCount = folders.filter((f) => f.initialized).length;

  if (countEl) {
    countEl.textContent = folders.length ? initCount + '/' + folders.length + ' 已初始化' : '';
  }
  if (!listEl) return initCount;

  listEl.innerHTML = '';
  const items = folders.slice();
  if (current && !items.some((f) => normPath(f.path) === currentN)) {
    const parts = current.replace(/\\/g, '/').split('/');
    const leaf = parts[parts.length - 1] || current;
    items.unshift({
      path: current,
      name: leaf,
      shortName: leaf,
      initialized: !!project.initialized,
      device: (project.config && project.config.device) || target.device || '',
    });
  }

  items.forEach((f) => {
    const isActive = normPath(f.path) === currentN;
    const shortPath =
      f.relativePath && f.relativePath !== '.' ? f.relativePath : f.shortName || f.name || '';
    const main = el('div', { className: 'main' }, [
      el('span', { className: 'title-line', text: f.name || f.shortName || f.path || '' }),
      el('span', {
        className: 'sub-line',
        text: (f.initialized ? '已初始化' : '未初始化') + (shortPath ? ' · ' + shortPath : ''),
      }),
    ]);
    const sideKids = [];
    if (isActive) sideKids.push(el('span', { className: 'active-tag', text: '当前' }));
    if (f.device || f.initialized) {
      sideKids.push(el('span', { className: 'chip', text: f.device || 'MSPM0', title: f.device || '' }));
    }
    const card = el(
      'div',
      {
        className: 'project-item' + (isActive ? ' active' : '') + (s.busyAction ? ' disabled' : ''),
        role: 'option',
        tabIndex: s.busyAction ? -1 : 0,
        title: f.path,
        dataset: { path: f.path },
      },
      [el('span', { className: 'dot ' + (f.initialized ? 'ok' : 'warn') }), main, el('div', { className: 'side' }, sideKids)]
    );
    card.setAttribute('aria-selected', isActive ? 'true' : 'false');
    const activate = () => {
      if (suppress || s.busyAction || isActive) return;
      post('setWorkspaceFolder', { path: f.path });
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
    listEl.appendChild(card);
  });
  return initCount;
}

function applyActionAvailability(s) {
  const a = s.actions || {};
  const busy = !!s.busyAction;
  const hasWs = !!(s.workspaceFolder || (s.workspaceFolders && s.workspaceFolders.length));
  BUTTONS.forEach((btn) => {
    const node = $(btn.id);
    if (!node) return;
    let enabled;
    if (btn.always) enabled = true;
    else if (btn.needsWs) enabled = hasWs && !busy;
    else enabled = !!a[btn.actionKey];
    node.disabled = !enabled || busy;
  });
}

function render(s) {
  if (!s) return;
  state = s;
  suppress = true;
  try {
    applyPage(s.page || currentPage || 'console');
    const project = s.project || { initialized: false };
    const target = s.target || {};
    const toolsOk = s.doctor ? s.doctor.ok : false;
    setBadge('toolsBadge', toolsOk ? 'Tools: Ready' : 'Tools: Check', toolsOk ? 'ok' : 'warn');
    setBadge(
      'projectBadge',
      project.initialized ? 'Project: ' + (project.name || 'OK') : 'Project: 未初始化',
      project.initialized ? 'ok' : 'warn'
    );
    setBusy(s.busyAction || '');

    const initCount = renderProjectList(s, project, target);

    const healthEl = $('healthMeta');
    if (healthEl) {
      healthEl.textContent =
        s.health && s.health.issues && s.health.issues.length
          ? s.health.issues.map((i) => i.message).join(' | ')
          : '';
    }

    const root = s.workspaceFolder || project.root || '(无工作区)';
    const name = project.name || '';
    const multiHint = initCount > 0 ? ' · 共 ' + initCount + ' 个工程' : '';
    const autoHint = s.settings && s.settings.autoSwitchProject !== false ? ' · 自动切换开' : '';
    const deviceLabel = (project.config && project.config.device) || target.device || '';
    const projectMeta = $('projectMeta');
    if (projectMeta) {
      projectMeta.textContent = project.initialized
        ? '当前: ' + name + (deviceLabel ? ' · ' + deviceLabel : '') + multiHint + autoHint
        : '未初始化 · ' + (name || root) + multiHint + autoHint;
      projectMeta.title = root;
    }

    allDevices = s.devices || [];
    selectedDevice = target.device || selectedDevice || '';
    const deviceField = $('device');
    if (deviceField) {
      const current = String(deviceField.value || '').trim();
      const resolved = resolveDevice(current);
      if (!current || resolved || normalizeDeviceQuery(current) === normalizeDeviceQuery(selectedDevice)) {
        deviceField.value = selectedDevice;
        fillDeviceDatalist('');
      } else {
        fillDeviceDatalist(current);
      }
    }

    const probeSel = $('probe');
    if (probeSel) {
      probeSel.innerHTML = '';
      (s.probes || []).forEach((p) => {
        probeSel.appendChild(el('option', { value: p.id, text: p.label }));
      });
      if (target.probe) probeSel.value = target.probe;
    }
    if ($('iface') && target.interface) $('iface').value = target.interface;
    if ($('speed')) $('speed').value = String(target.speed || 4000);

    const doctorTools = (s.doctor && s.doctor.tools) || [];
    toolKeys.forEach((k) => {
      const pathEl = $('path-' + k);
      if (pathEl) pathEl.value = (s.tools && s.tools[k]) || '';
      const check = doctorTools.find((t) => t.key === k);
      const m = $('mark-' + k);
      if (m) {
        const ui = statusMark(check && check.status);
        m.className = ui.className;
        m.textContent = ui.symbol;
        m.title = (check && check.message) || '';
      }
    });

    applySettings(s.settings);
    applyActionAvailability(s);
    setMsg(s.lastMessage || '', s.lastMessageLevel || 'info');
  } catch (err) {
    console.error('[MSPM0 sidebar render]', err);
    setMsg('侧边栏渲染失败: ' + (err && err.message ? err.message : String(err)), 'error');
  } finally {
    suppress = false;
  }
}

function emitTarget(forceDevice) {
  if (suppress) return;
  const deviceVal = forceDevice ? selectedDevice : selectedDevice || ($('device') && $('device').value);
  if (!deviceVal) return;
  post('setTargetConfig', {
    device: deviceVal,
    probe: $('probe') && $('probe').value,
    interface: $('iface') && $('iface').value,
    speed: Number(($('speed') && $('speed').value) || 4000),
  });
}

function on(id, event, handler) {
  const node = $(id);
  if (node) node.addEventListener(event, handler);
}

function fireButton(btn) {
  if (btn.run) post('runAction', { action: btn.run });
  else if (btn.msg) post(btn.msg);
}

try {
  on('tabConsole', 'click', () => {
    applyPage('console');
    post('setPage', { page: 'console' });
  });
  on('tabSettings', 'click', () => {
    applyPage('settings');
    post('setPage', { page: 'settings' });
  });

  toolKeys.forEach((k) => {
    on('path-' + k, 'change', (e) => {
      if (suppress) return;
      post('setToolPath', { key: k, path: e.target.value });
    });
  });
  document.querySelectorAll('button.browse').forEach((btn) => {
    btn.addEventListener('click', () => post('browseToolPath', { key: btn.dataset.key }));
  });

  const deviceEl = $('device');
  if (deviceEl) {
    deviceEl.addEventListener('input', (e) => {
      if (suppress) return;
      const raw = e.target.value || '';
      fillDeviceDatalist(raw);
      const hit = resolveDevice(raw);
      if (hit && hit.id !== selectedDevice && normalizeDeviceQuery(raw) === normalizeDeviceQuery(hit.id)) {
        selectedDevice = hit.id;
        emitTarget(true);
      }
    });
    deviceEl.addEventListener('change', (e) => {
      if (!suppress) commitDevice(e.target.value, false);
    });
    deviceEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitDevice(e.target.value, false);
      }
    });
    deviceEl.addEventListener('blur', (e) => {
      if (!suppress && resolveDevice(e.target.value)) commitDevice(e.target.value, true);
    });
  }
  ['probe', 'iface', 'speed'].forEach((id) => on(id, 'change', () => emitTarget(false)));

  bindSettings();

  BUTTONS.forEach((btn) => {
    on(btn.id, 'click', () => fireButton(btn));
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'state') render(msg.payload);
    if (msg && msg.type === 'actionProgress' && msg.payload && msg.payload.message) {
      const st = msg.payload.status;
      setMsg(msg.payload.message, st === 'error' ? 'error' : st === 'ok' ? 'success' : 'info');
    }
  });
  post('ready');
} catch (err) {
  console.error('[MSPM0 sidebar init]', err);
  try {
    setMsg('侧边栏初始化失败: ' + (err && err.message ? err.message : String(err)), 'error');
  } catch (_) {
    /* ignore */
  }
}
