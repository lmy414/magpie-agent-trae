#!/usr/bin/env node
import { createBridge, DEFAULT_PORT, LOCAL_TOKEN } from './bridge.mjs';
import { restoreLegacyClientRefresh } from './legacy-client-refresh.mjs';
import { installation } from './installation.mjs';

const command = process.argv[2] || 'status';
const port = Number(process.env.MAGPIE_TRAE_PORT || DEFAULT_PORT);
if (command === 'setup') {
  const client = installation();
  console.log(`平台 ${client.platform}，客户端版本 ${client.version ?? '未知'}，默认模式 ${client.mode}。`);
  console.log('在 Magpie 的 Agent 页面打开 Trae 接入，运行 models 查看可选模型 ID。');
  if (client.mode === 'native') console.log('添加或移除模型后，请重新打开模型菜单、切换项目或重启 Trae。自动同步的模型带有“· Magpie”后缀。');
  console.log(`手动接入时，在 Trae 添加 OpenAI Chat Completions 自定义模型，打开完整 URL，填写 http://127.0.0.1:${port}/v1/chat/completions、models 中的模型 ID 和以下本机桥接标记。\n${LOCAL_TOKEN}`);
} else if (command === 'restore-client') {
  const result = restoreLegacyClientRefresh();
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'serve') {
  const bridge = createBridge({ port, nativeSync: false });
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
