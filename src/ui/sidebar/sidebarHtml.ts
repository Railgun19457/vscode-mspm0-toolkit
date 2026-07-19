import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview, nonce: string): string {
const csp = [
`default-src 'none'`,
`style-src ${webview.cspSource} 'unsafe-inline'`,
`script-src 'nonce-${nonce}'`,
].join('; ');

return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MSPM0 Toolkit</title>
  <style>
    :root { --radius: 8px; }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0;
      padding: 10px;
      line-height: 1.35;
    }
    h1 { font-size: 13px; font-weight: 700; margin: 0 0 8px; }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 10px;
    }
    .tabs button {
      border: 1px solid var(--vscode-widget-border, #333);
      background: transparent;
      color: var(--vscode-foreground);
      border-radius: 999px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .tabs button.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
    .page { display: none; }
    .page.active { display: block; }
    .status-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .badge {
      border-radius: 999px; padding: 3px 9px; font-size: 11px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      border: 1px solid transparent;
    }
    .badge.ok { border-color: var(--vscode-testing-iconPassed, #3ba55d); }
    .badge.warn { border-color: var(--vscode-editorWarning-foreground, #cca700); }
    .badge.err { border-color: var(--vscode-testing-iconFailed, #f14c4c); }
    .badge.busy { border-color: var(--vscode-focusBorder, #007acc); animation: pulse 1.1s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
    details.section {
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: var(--radius);
      margin-bottom: 10px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-foreground) 8%);
      overflow: hidden;
    }
    details.section > summary {
      list-style: none; cursor: pointer; user-select: none; padding: 9px 10px;
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    details.section > summary::-webkit-details-marker { display: none; }
    details.section > summary::after { content: '▾'; opacity: .7; }
    details.section:not([open]) > summary::after { transform: rotate(-90deg); }
    details.section .body { padding: 0 10px 10px; }
    .row { display: grid; grid-template-columns: 92px 1fr auto auto; gap: 6px; align-items: center; margin-bottom: 6px; }
    .row.simple { grid-template-columns: 92px 1fr; }
    .row.toggle { grid-template-columns: 1fr auto; }
    label { opacity: .85; font-size: 12px; }
    .desc { font-size: 11px; opacity: .7; margin: -2px 0 8px; line-height: 1.4; }
    input[type="text"], input[type="number"], select {
      width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 5px 7px;
    }
    input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); outline-offset: -1px; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--vscode-focusBorder, #007acc); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid color-mix(in srgb, var(--vscode-button-foreground) 28%, transparent);
      border-radius: 5px;
      padding: 6px 8px;
      cursor: pointer;
      font-size: 12px;
      min-height: 28px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vscode-contrastBorder, transparent) 60%, transparent);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid color-mix(in srgb, var(--vscode-button-secondaryForeground) 35%, var(--vscode-widget-border, #555) 65%);
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button .kbd { display:block; margin-top:2px; font-size:10px; opacity:.75; font-weight:500; }
    .btn-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .btn-row button { flex: 1 1 90px; }
    .btn-row.primary button { flex: 1 1 100px; font-weight: 600; }
    .mark { width: 18px; text-align: center; font-weight: 700; }
    .mark.ok { color: var(--vscode-testing-iconPassed, #3ba55d); }
    .mark.err { color: var(--vscode-testing-iconFailed, #f14c4c); }
    .mark.warn { color: var(--vscode-editorWarning-foreground, #cca700); }
    .meta { font-size: 11px; opacity: .8; line-height: 1.45; word-break: break-all; margin-bottom: 4px; }
    .hint { font-size: 11px; opacity: .7; margin-top: 4px; }
    .msg {
      margin: 0 0 10px; font-size: 12px; padding: 7px 9px; border-radius: 6px;
      background: var(--vscode-inputValidation-infoBackground, transparent);
      border: 1px solid var(--vscode-widget-border, #333); word-break: break-word;
    }
    .msg.success { border-color: var(--vscode-testing-iconPassed, #3ba55d); }
    .msg.error { border-color: var(--vscode-testing-iconFailed, #f14c4c); }
    .msg.info { border-color: var(--vscode-focusBorder, #007acc); }
    .hidden { display: none; }
    .footer-hint { font-size: 10px; opacity: .65; margin-top: 8px; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>MSPM0 Toolkit</h1>
  <div class="tabs">
    <button id="tabConsole" class="active" type="button">控制台</button>
    <button id="tabSettings" type="button">配置</button>
  </div>
  <div class="status-bar">
    <span id="toolsBadge" class="badge">Tools: --</span>
    <span id="projectBadge" class="badge">Project: --</span>
    <span id="busyBadge" class="badge busy hidden">Busy</span>
  </div>
  <div id="message" class="msg hidden"></div>

  <div id="pageConsole" class="page active">
    <details class="section" open>
      <summary>操作</summary>
      <div class="body">
        <div class="btn-row primary">
          <button id="btnBuild" title="构建">构建</button>
          <button id="btnFlash" title="烧录">烧录</button>
          <button id="btnDebug" title="调试">调试</button>
        </div>
        <div class="btn-row">
          <button id="btnClean" class="secondary">清理</button>
          <button id="btnSysGui" class="secondary">SysConfig</button>
          <button id="btnSysGen" class="secondary">生成配置</button>
          <button id="btnSerial" class="secondary">串口</button>
        </div>
        <div class="footer-hint">也可使用状态栏或编辑器右上角 MSPM0 下拉按钮</div>
      </div>
    </details>

    <details class="section" open>
      <summary>工程</summary>
      <div class="body">
        <div class="row simple">
          <label for="workspaceFolder">工作区</label>
          <select id="workspaceFolder"></select>
        </div>
        <div class="meta" id="projectMeta">未打开工作区</div>
        <div class="meta" id="healthMeta"></div>
        <div class="btn-row">
          <button id="btnInit">初始化工程</button>
          <button id="btnCreate" class="secondary">新建工程</button>
          <button id="btnSync" class="secondary">同步配置</button>
          <button id="btnHealth" class="secondary">健康检查</button>
        </div>
      </div>
    </details>

    <details class="section" open>
      <summary>目标配置</summary>
      <div class="body">
        <div class="row simple">
          <label for="device">芯片</label>
          <input id="device" type="text" list="deviceDatalist" spellcheck="false" placeholder="输入/选择，如 L130 / G3507" autocomplete="off" />
        </div>
        <datalist id="deviceDatalist"></datalist>
        <div class="row simple">
          <label for="probe">仿真器</label>
          <select id="probe"></select>
        </div>
        <div class="row simple">
          <label for="iface">接口</label>
          <select id="iface">
            <option value="swd">SWD</option>
            <option value="jtag">JTAG</option>
          </select>
        </div>
        <div class="row simple">
          <label for="speed">速度</label>
          <input id="speed" type="number" min="100" step="100" value="4000" />
        </div>
        <div class="hint">芯片支持输入关键字筛选，回车确认</div>
      </div>
    </details>
  </div>

  <div id="pageSettings" class="page">
    <details class="section" open>
      <summary>工作流</summary>
      <div class="body">
        <div class="row toggle">
          <div>
            <label for="optAutoSyscfg">构建前自动生成 SysConfig</label>
            <div class="desc">执行构建/（按开关）烧录调试前先 make syscfg</div>
          </div>
          <input id="optAutoSyscfg" type="checkbox" />
        </div>
        <div class="row toggle">
          <div>
            <label for="optBuildBeforeFlash">烧录前自动构建</label>
            <div class="desc">关闭后仅下载已有 build 产物（flash-only）</div>
          </div>
          <input id="optBuildBeforeFlash" type="checkbox" />
        </div>
        <div class="row toggle">
          <div>
            <label for="optBuildBeforeDebug">调试前自动构建</label>
            <div class="desc">启动调试前先编译，确保镜像最新</div>
          </div>
          <input id="optBuildBeforeDebug" type="checkbox" />
        </div>
        <div class="row toggle">
          <div>
            <label for="optAutoDetectStartup">启动时自动探测工具</label>
            <div class="desc">路径为空时扩展激活后自动扫描本机工具</div>
          </div>
          <input id="optAutoDetectStartup" type="checkbox" />
        </div>
        <div class="row toggle">
          <div>
            <label for="optOpenOutputOnError">仅出错时打开输出</label>
            <div class="desc">默认有输出就打开；启用后成功只提示状态栏，失败才打开输出</div>
          </div>
          <input id="optOpenOutputOnError" type="checkbox" />
        </div>
      </div>
    </details>

    <details class="section" open>
      <summary>构建与串口</summary>
      <div class="body">
        <div class="row simple">
          <label for="optBuildJobs">并行任务 -j</label>
          <input id="optBuildJobs" type="number" min="1" step="1" value="8" />
        </div>
        <div class="row simple">
          <label for="optSerialBaud">串口波特率</label>
          <input id="optSerialBaud" type="number" min="1200" step="100" value="115200" />
        </div>
        <div class="row simple">
          <label for="optToolScope">路径写入范围</label>
          <select id="optToolScope">
            <option value="user">用户设置（全局）</option>
            <option value="workspace">工作区设置</option>
          </select>
        </div>
        <div class="row simple">
          <label for="optDefaultDevice">默认芯片</label>
          <input id="optDefaultDevice" type="text" list="deviceDatalist" spellcheck="false" />
        </div>
        <div class="row simple">
          <label for="optDefaultProbe">默认仿真器</label>
          <select id="optDefaultProbe">
            <option value="jlink">SEGGER J-Link</option>
            <option value="openocd">OpenOCD</option>
            <option value="xds110">XDS110</option>
            <option value="cmsis-dap">CMSIS-DAP</option>
          </select>
        </div>
      </div>
    </details>

    <details class="section" open>
      <summary>工具路径</summary>
      <div class="body">
        <div class="btn-row" style="margin-top:0;margin-bottom:8px">
          <button id="btnDetect">自动探测</button>
          <button id="btnForceDetect" class="secondary">强制覆盖探测</button>
          <button id="btnDoctor" class="secondary">重新检测</button>
        </div>
        ${['gcc', 'sdk', 'sysconfig', 'jlink', 'openocd', 'make']
.map(
(k) => `
        <div class="row" data-tool="${k}">
          <label>${k}</label>
          <input type="text" id="path-${k}" spellcheck="false" />
          <button class="secondary browse" data-key="${k}">浏览</button>
          <span class="mark" id="mark-${k}">?</span>
        </div>`
)
.join('')}
        <div class="hint">工具路径与上方工作流开关会写入 VS Code 设置（mspm0.*）</div>
      </div>
    </details>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = null;
    let suppress = false;
    let allDevices = [];
    let selectedDevice = '';
    let currentPage = 'console';

    const $ = (id) => document.getElementById(id);
    const toolKeys = ['gcc','sdk','sysconfig','jlink','openocd','make'];

    function setMsg(text, level) {
      const el = $('message');
      if (!text) { el.className = 'msg hidden'; el.textContent=''; return; }
      el.className = 'msg ' + (level || 'info');
      el.textContent = text;
    }
    function markClass(status) {
      if (status === 'ok') return 'mark ok';
      if (status === 'error') return 'mark err';
      if (status === 'warn') return 'mark warn';
      return 'mark';
    }
    function markSymbol(status) {
      if (status === 'ok') return '✓';
      if (status === 'error') return '!';
      if (status === 'warn') return '!';
      return '?';
    }
    function normalizeDeviceQuery(q) {
      return String(q || '').trim().toUpperCase().replace(/\\s+/g, '');
    }
    function deviceMatches(d, query) {
      if (!query) return true;
      const id = normalizeDeviceQuery(d.id);
      const series = normalizeDeviceQuery(d.series || '');
      const family = normalizeDeviceQuery(d.family || '');
      const bare = id.replace(/^MSPM0/, '');
      const qBare = query.replace(/^MSPM0/, '');
      return id.includes(query) || bare.includes(query) || bare.includes(qBare)
        || series.includes(query) || family.includes(query) || ('MSPM0' + query) === id;
    }
    function fillDeviceDatalist(filterText) {
      const datalist = $('deviceDatalist');
      if (!datalist) return;
      const q = normalizeDeviceQuery(filterText);
      const list = (allDevices || []).filter((d) => deviceMatches(d, q)).slice(0, 80);
      datalist.innerHTML = '';
      list.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.label = d.series ? (d.id + ' (' + d.series + ')') : d.id;
        datalist.appendChild(opt);
      });
    }
    function resolveDevice(raw) {
      const typed = String(raw || '').trim();
      if (!typed) return undefined;
      const q = normalizeDeviceQuery(typed);
      const list = allDevices || [];
      let hit = list.find((d) => normalizeDeviceQuery(d.id) === q);
      if (hit) return hit;
      const matches = list.filter((d) => deviceMatches(d, q));
      if (matches.length === 1) return matches[0];
      const bareMatches = list.filter((d) => normalizeDeviceQuery(d.id).replace(/^MSPM0/, '') === q.replace(/^MSPM0/, ''));
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
      const el = $('busyBadge');
      if (!el) return;
      if (busyText) { el.textContent = 'Busy: ' + busyText; el.classList.remove('hidden'); }
      else el.classList.add('hidden');
    }
    function applyPage(page) {
      currentPage = page === 'settings' ? 'settings' : 'console';
      $('pageConsole').classList.toggle('active', currentPage === 'console');
      $('pageSettings').classList.toggle('active', currentPage === 'settings');
      $('tabConsole').classList.toggle('active', currentPage === 'console');
      $('tabSettings').classList.toggle('active', currentPage === 'settings');
    }
    function postSetting(key, value) {
      post('setPluginSetting', { key, value });
    }

    function render(s) {
      state = s;
      suppress = true;
      applyPage(s.page || currentPage || 'console');

      const toolsOk = s.doctor ? s.doctor.ok : false;
      $('toolsBadge').textContent = toolsOk ? 'Tools: Ready' : 'Tools: Check';
      $('toolsBadge').className = 'badge ' + (toolsOk ? 'ok' : 'warn');
      $('projectBadge').textContent = s.project.initialized ? 'Project: OK' : 'Project: 未初始化';
      $('projectBadge').className = 'badge ' + (s.project.initialized ? 'ok' : 'warn');
      setBusy(s.busyAction || '');

      // workspace
      const wsSel = $('workspaceFolder');
      if (wsSel) {
        wsSel.innerHTML = '';
        const folders = s.workspaceFolders || [];
        if (!folders.length) {
          const opt = document.createElement('option');
          opt.value = ''; opt.textContent = '(无工作区)';
          wsSel.appendChild(opt); wsSel.disabled = true;
        } else {
          wsSel.disabled = false;
          folders.forEach((f) => {
            const opt = document.createElement('option');
            opt.value = f.path;
            opt.textContent = (f.initialized ? '✓ ' : '') + f.name;
            wsSel.appendChild(opt);
          });
          wsSel.value = s.workspaceFolder || folders[0].path;
        }
      }

      const healthEl = $('healthMeta');
      if (healthEl) {
        healthEl.textContent = (s.health && s.health.issues && s.health.issues.length)
          ? s.health.issues.map((i) => i.message).join(' | ') : '';
      }
      const root = s.workspaceFolder || s.project.root || '(无工作区)';
      const name = s.project.name || '';
      $('projectMeta').textContent = s.project.initialized
        ? ('工程: ' + name + ' | ' + root + ' | device=' + (s.project.config?.device || s.target.device))
        : ('未初始化 | ' + root);

      // devices/target
      allDevices = s.devices || [];
      selectedDevice = s.target.device || selectedDevice || '';
      const deviceField = $('device');
      if (deviceField) {
        const current = String(deviceField.value || '').trim();
        const resolved = resolveDevice(current);
        if (!current || resolved || normalizeDeviceQuery(current) === normalizeDeviceQuery(selectedDevice)) {
          deviceField.value = selectedDevice;
          fillDeviceDatalist('');
        } else fillDeviceDatalist(current);
      }
      const probeSel = $('probe');
      probeSel.innerHTML = '';
      (s.probes || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id; opt.textContent = p.label;
        probeSel.appendChild(opt);
      });
      probeSel.value = s.target.probe;
      $('iface').value = s.target.interface;
      $('speed').value = String(s.target.speed || 4000);

      // tools
      toolKeys.forEach(k => {
        $('path-' + k).value = s.tools?.[k] || '';
        const check = s.doctor?.tools?.find(t => t.key === k);
        const m = $('mark-' + k);
        m.className = markClass(check?.status);
        m.textContent = markSymbol(check?.status);
        m.title = check?.message || '';
      });

      // settings page
      const st = s.settings || {};
      $('optAutoSyscfg').checked = !!st.autoSyscfgOnBuild;
      $('optBuildBeforeFlash').checked = st.buildBeforeFlash !== false;
      $('optBuildBeforeDebug').checked = st.buildBeforeDebug !== false;
      $('optAutoDetectStartup').checked = st.autoDetectOnStartup !== false;
      $('optOpenOutputOnError').checked = !!st.openOutputOnError;
      $('optBuildJobs').value = String(st.buildJobs || 8);
      $('optSerialBaud').value = String(st.serialBaudRate || 115200);
      $('optToolScope').value = st.toolPathScope === 'workspace' ? 'workspace' : 'user';
      $('optDefaultDevice').value = st.defaultDevice || '';
      $('optDefaultProbe').value = st.defaultProbe || 'jlink';

      // actions
      const a = s.actions || {};
      const busy = !!s.busyAction;
      const setDisabled = (id, enabled) => { const el = $(id); if (el) el.disabled = !enabled || busy; };
      setDisabled('btnInit', a.initProject);
      setDisabled('btnSync', a.syncConfig);
      setDisabled('btnBuild', a.build);
      setDisabled('btnClean', a.clean);
      setDisabled('btnFlash', a.flash);
      setDisabled('btnSysGui', a.syscfgGui);
      setDisabled('btnSysGen', a.syscfgGen);
      setDisabled('btnDebug', a.debug);
      setDisabled('btnHealth', a.healthCheck);
      setDisabled('btnCreate', a.createProject);
      setDisabled('btnForceDetect', a.forceDetect);
      setDisabled('btnSerial', a.openSerial);
      setDisabled('btnDetect', true);
      setDisabled('btnDoctor', true);

      setMsg(s.lastMessage || '', s.lastMessageLevel || 'info');
      suppress = false;
    }

    function post(type, payload) {
      vscode.postMessage(payload === undefined ? { type } : { type, payload });
    }
    function emitTarget(forceDevice) {
      if (suppress) return;
      const deviceVal = forceDevice ? selectedDevice : (selectedDevice || $('device').value);
      if (!deviceVal) return;
      post('setTargetConfig', {
        device: deviceVal,
        probe: $('probe').value,
        interface: $('iface').value,
        speed: Number($('speed').value || 4000)
      });
    }

    // tabs
    $('tabConsole').onclick = () => { applyPage('console'); post('setPage', { page: 'console' }); };
    $('tabSettings').onclick = () => { applyPage('settings'); post('setPage', { page: 'settings' }); };

    // tools
    toolKeys.forEach(k => {
      $('path-' + k).addEventListener('change', (e) => {
        if (suppress) return;
        post('setToolPath', { key: k, path: e.target.value });
      });
    });
    document.querySelectorAll('button.browse').forEach(btn => {
      btn.addEventListener('click', () => post('browseToolPath', { key: btn.dataset.key }));
    });

    // device
    const deviceEl = $('device');
    if (deviceEl) {
      deviceEl.addEventListener('input', (e) => {
        if (suppress) return;
        const raw = e.target.value || '';
        fillDeviceDatalist(raw);
        const hit = resolveDevice(raw);
        if (hit && hit.id !== selectedDevice && normalizeDeviceQuery(raw) === normalizeDeviceQuery(hit.id)) {
          selectedDevice = hit.id; emitTarget(true);
        }
      });
      deviceEl.addEventListener('change', (e) => { if (!suppress) commitDevice(e.target.value, false); });
      deviceEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitDevice(e.target.value, false); } });
      deviceEl.addEventListener('blur', (e) => { if (!suppress && resolveDevice(e.target.value)) commitDevice(e.target.value, true); });
    }
    ['probe','iface','speed'].forEach(id => $(id).addEventListener('change', () => emitTarget(false)));

    // settings bindings
    $('optAutoSyscfg').addEventListener('change', (e) => { if (!suppress) postSetting('autoSyscfgOnBuild', !!e.target.checked); });
    $('optBuildBeforeFlash').addEventListener('change', (e) => { if (!suppress) postSetting('buildBeforeFlash', !!e.target.checked); });
    $('optBuildBeforeDebug').addEventListener('change', (e) => { if (!suppress) postSetting('buildBeforeDebug', !!e.target.checked); });
    $('optOpenOutputOnError').addEventListener('change', (e) => { if (!suppress) postSetting('openOutputOnError', !!e.target.checked); });
    $('optAutoDetectStartup').addEventListener('change', (e) => { if (!suppress) postSetting('autoDetectOnStartup', !!e.target.checked); });
    $('optBuildJobs').addEventListener('change', (e) => { if (!suppress) postSetting('buildJobs', Number(e.target.value || 8)); });
    $('optSerialBaud').addEventListener('change', (e) => { if (!suppress) postSetting('serialBaudRate', Number(e.target.value || 115200)); });
    $('optToolScope').addEventListener('change', (e) => { if (!suppress) postSetting('toolPathScope', e.target.value); });
    $('optDefaultDevice').addEventListener('change', (e) => { if (!suppress) postSetting('defaultDevice', String(e.target.value || '').trim()); });
    $('optDefaultProbe').addEventListener('change', (e) => { if (!suppress) postSetting('defaultProbe', e.target.value); });

    // actions
    $('btnDetect').onclick = () => post('autoDetect');
    $('btnDoctor').onclick = () => post('doctor');
    $('btnInit').onclick = () => post('initProject');
    $('btnSync').onclick = () => post('syncConfig');
    $('btnBuild').onclick = () => post('runAction', { action: 'build' });
    $('btnClean').onclick = () => post('runAction', { action: 'clean' });
    $('btnFlash').onclick = () => post('runAction', { action: 'flash' });
    $('btnSysGui').onclick = () => post('runAction', { action: 'syscfgGui' });
    $('btnSysGen').onclick = () => post('runAction', { action: 'syscfgGen' });
    $('btnDebug').onclick = () => post('runAction', { action: 'debug' });
    $('btnHealth').onclick = () => post('healthCheck');
    $('btnCreate').onclick = () => post('createProject');
    $('btnForceDetect').onclick = () => post('forceDetect');
    $('btnSerial').onclick = () => post('openSerial');
    $('workspaceFolder').addEventListener('change', (e) => post('setWorkspaceFolder', { path: e.target.value }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg?.type === 'state') render(msg.payload);
      if (msg?.type === 'actionProgress' && msg.payload?.message) {
        setMsg(msg.payload.message, msg.payload.status === 'error' ? 'error' : (msg.payload.status === 'ok' ? 'success' : 'info'));
      }
    });
    post('ready');
  </script>
</body>
</html>`;
}
