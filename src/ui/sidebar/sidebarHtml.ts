import * as vscode from 'vscode';

const TOOL_KEYS = ['gcc', 'sdk', 'sysconfig', 'jlink', 'openocd', 'make'] as const;

/**
 * Build the sidebar webview document.
 * CSS/JS live under media/sidebar/ to keep this file small and avoid
 * double-escaping when embedding large scripts in a TS template literal.
 */
export function getSidebarHtml(
	webview: vscode.Webview,
	nonce: string,
	extensionUri: vscode.Uri
): string {
	const csp = [
		`default-src 'none'`,
		`style-src ${webview.cspSource}`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');

	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar', 'sidebar.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar', 'main.js'));

	const toolRows = TOOL_KEYS.map(
		(k) => `
        <div class="row" data-tool="${k}">
          <label>${k}</label>
          <input type="text" id="path-${k}" spellcheck="false" />
          <button class="secondary browse" data-key="${k}">浏览</button>
          <span class="mark" id="mark-${k}">?</span>
        </div>`
	).join('');

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MSPM0 Toolkit</title>
  <link rel="stylesheet" href="${styleUri}" />
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
        <div class="project-list-head">
          <span>工程列表</span>
          <span class="count" id="projectCount"></span>
        </div>
        <div class="project-list" id="projectList" role="listbox" aria-label="MSPM0 工程列表"></div>
        <div class="btn-row" style="margin-top:0">
          <button id="btnPickFolder" class="secondary" title="在工作区内选择子文件夹作为工程根">选择文件夹</button>
          <button id="btnRefreshProjects" class="secondary" title="重新扫描工作区内的 MSPM0 工程">刷新列表</button>
        </div>
        <div class="meta" id="projectMeta">未打开工作区</div>
        <div class="meta" id="healthMeta"></div>
        <div class="btn-row">
          <button id="btnInit">初始化工程</button>
          <button id="btnCreate" class="secondary">新建工程</button>
          <button id="btnSync" class="secondary">同步配置</button>
          <button id="btnHealth" class="secondary">健康检查</button>
        </div>
        <div class="footer-hint">点击列表切换工程；打开源文件可自动切换（配置页可关）；新建默认在所选目录内创建</div>
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
        <div class="row toggle">
          <div>
            <label for="optAutoSwitchProject">按编辑器自动切换工程</label>
            <div class="desc">打开/切换文件时，自动选中包含该文件的最近 MSPM0 工程根（默认开启）</div>
          </div>
          <input id="optAutoSwitchProject" type="checkbox" />
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
        ${toolRows}
        <div class="hint">工具路径与上方工作流开关会写入 VS Code 设置（mspm0.*）</div>
      </div>
    </details>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
