#!/usr/bin/env node
import { createBridge, DEFAULT_PORT } from './bridge.mjs';
import { installClientRefresh } from './client-refresh.mjs';

const command = process.argv[2] || 'status';
const port = Number(process.env.MAGPIE_TRAE_PORT || DEFAULT_PORT);
if (command === 'setup') {
  console.log('在 Magpie 的 Agent 页面打开 Trae 的接入开关。插件会自动同步 Magpie 模型目录；同步完成后，在 Trae 的模型菜单选择带“· Magpie”的模型。\n请保持 Magpie 运行，并使用已登录的 Trae CN。在 Trae 里打开模型菜单即可看到最新目录（Windows 首次安装刷新组件后需重启 Trae 一次）。\n运行 status 查看连接和原生目录同步状态，运行 models 查看目录。');
} else if (command === 'restore-client') {
  // macOS 从不修改 Trae 的 out/main.js（在 Developer ID 封签内），因此无需还原。
  // 仍然打印一条结构化结果，方便脚本和排障时判断实际发生了什么。
  if (process.platform === 'darwin') {
    console.log(JSON.stringify({ state: 'not_needed', platform: 'darwin',
      reason: 'macOS 不修改 Trae 的 out/main.js；打开模型菜单即由客户端自行刷新目录。' }, null, 2));
  } else {
    console.log(JSON.stringify(installClientRefresh({ restore: true }), null, 2));
  }
} else if (command === 'serve') {
  const bridge = createBridge({ port });
  await bridge.listen();
  console.log(`Trae bridge listening on 127.0.0.1:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await bridge.close(); });
} else if (command === 'status' || command === 'models') {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    const status = await response.json();
    if (!response.ok || status.name !== 'magpie-trae') throw new Error();
    console.log(JSON.stringify(command === 'models' ? status.models : status, null, 2));
  } catch { console.error('Trae bridge is not answering. Keep Magpie running and enable this plugin.'); process.exitCode = 1; }
} else { console.error('Usage: magpie-trae status|models|setup|serve|restore-client'); process.exitCode = 1; }
