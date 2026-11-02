<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LabInteractionResult, LabTarget } from '@cyberquest/shared';
import { api } from './api';
import { useAuth } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const target = ref<LabTarget>();
const input = ref('');
const feedback = ref('');
const output = ref('');
const loading = ref(true);
const submitting = ref(false);
const copied = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const remaining = computed(() => {
  if (!target.value) return '00:00';
  const seconds = Math.max(0, Math.ceil((new Date(target.value.expiresAt).getTime() - now.value) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});
const isWeb = computed(() => target.value?.kind.startsWith('WEB_'));

async function load() {
  if (!auth.token) {
    await router.replace({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  loading.value = true;
  try {
    target.value = await api<LabTarget>(`/labs/instances/${route.params.instanceId}/target`);
    if (target.value.kind === 'WEB_PARAMETER') input.value = String(route.query.account_id || 'U-1001');
    if (target.value.kind === 'WEB_TOKEN') input.value = target.value.artifact.match(/legacy_session=([^;]+)/)?.[1] ?? '';
  } catch (error: any) {
    feedback.value = error.message || '靶场加载失败，请返回工作台重新启动。';
  } finally {
    loading.value = false;
  }
}

async function interact() {
  if (!input.value.trim() || submitting.value) return;
  submitting.value = true;
  copied.value = false;
  try {
    if (target.value?.kind === 'WEB_PARAMETER') {
      window.history.replaceState({}, '', `${route.path}?account_id=${encodeURIComponent(input.value.trim())}`);
    }
    const response = await api<LabInteractionResult>(`/labs/instances/${route.params.instanceId}/interact`, {
      method: 'POST', body: JSON.stringify({ input: input.value }),
    });
    feedback.value = response.message;
    output.value = response.output ?? '';
  } catch (error: any) {
    feedback.value = error.message || '目标站请求失败，请检查会话是否仍在有效期内。';
  } finally {
    submitting.value = false;
  }
}

function downloadArtifact() {
  if (!target.value?.download) return;
  const url = URL.createObjectURL(new Blob([target.value.artifact], { type: target.value.download.mediaType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = target.value.download.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyOutput() {
  if (!output.value) return;
  await navigator.clipboard.writeText(output.value);
  copied.value = true;
}

onMounted(() => {
  load();
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (clock) clearInterval(clock); });
</script>

<template>
  <section class="sandbox-target-page" :class="{ 'web-only-target': isWeb }">
    <div v-if="loading" class="sandbox-target-state">正在连接独立 CTF 靶场…</div>

    <div v-else-if="!target" class="sandbox-target-state error">
      <span>连接已中断</span><h1>无法打开靶场</h1><p>{{ feedback }}</p>
      <RouterLink to="/challenges">返回题库</RouterLink>
    </div>

    <template v-else-if="isWeb">
      <section class="standalone-site" :class="target.kind === 'WEB_PARAMETER' ? 'northstar-site' : 'legacy-site'">
        <span v-if="target.kind === 'WEB_PARAMETER'" class="target-hidden-clue" data-migration-account="U-7842" aria-hidden="true"></span>
        <header class="site-header">
          <a class="site-brand" href="#">{{ target.kind === 'WEB_PARAMETER' ? 'NORTHSTAR' : 'LEGACY' }}<i>{{ target.kind === 'WEB_PARAMETER' ? 'DIRECTORY' : 'PORTAL' }}</i></a>
          <nav><a href="#">首页</a><a href="#">成员</a><a href="#">账户</a></nav>
          <div class="site-user"><span></span>{{ target.kind === 'WEB_PARAMETER' ? 'guest_student' : 'student' }}</div>
        </header>

        <main class="site-main">
          <div class="site-kicker">{{ target.kind === 'WEB_PARAMETER' ? 'MEMBER DIRECTORY' : 'ACCOUNT CONSOLE' }}</div>
          <h1>{{ target.kind === 'WEB_PARAMETER' ? '查找团队成员' : '欢迎回到 Legacy Portal' }}</h1>
          <p>{{ target.kind === 'WEB_PARAMETER' ? '使用成员编号查看公开资料。' : '当前会话可访问基础账户服务。' }}</p>

          <section v-if="target.kind === 'WEB_PARAMETER'" class="site-search-card">
            <label for="member-id">成员编号</label>
            <div><input id="member-id" v-model="input" autocomplete="off" placeholder="U-1001" @keyup.enter="interact"><button :disabled="submitting" @click="interact">{{ submitting ? '查询中…' : '查询资料' }}</button></div>
            <small>示例：U-1001</small>
          </section>

          <section v-else class="legacy-session-card">
            <div class="legacy-status"><span>SESSION ACTIVE</span><b>student access</b></div>
            <label for="legacy-token">legacy_session</label>
            <textarea id="legacy-token" v-model="input" rows="4" spellcheck="false"></textarea>
            <button :disabled="submitting" @click="interact">{{ submitting ? '正在打开…' : '访问管理控制台' }}</button>
            <small>诊断模式：会话内容使用 Base64 传输</small>
          </section>

          <section v-if="output || feedback" class="site-result" :class="{ privileged: output.includes('flag{') }">
            <header><span>{{ output.includes('flag{') ? 'PRIVILEGED RESPONSE' : 'API RESPONSE' }}</span><button v-if="output" @click="copyOutput">{{ copied ? '已复制' : '复制' }}</button></header>
            <p>{{ feedback }}</p>
            <pre v-if="output">{{ output }}</pre>
          </section>
        </main>

        <footer class="site-footer"><span>© 2026 {{ target.kind === 'WEB_PARAMETER' ? 'Northstar Systems' : 'Legacy Intranet' }}</span><span>session {{ remaining }}</span></footer>
      </section>
    </template>

    <template v-else-if="target.kind === 'ENCODED_ARTIFACT'">
      <section class="standalone-tool crypto-console">
        <header class="tool-window-bar"><b>RELAY DECODER</b><span>intercept / channel-07</span><em>{{ remaining }}</em></header>
        <main class="crypto-main">
          <section class="crypto-summary"><small>INCOMING TRANSMISSION</small><h1>收到一段未知编码消息</h1><p>原始数据已完整保留。判断数据表示方式，并在本地完成逐层还原。</p></section>
          <section class="artifact-window"><header><span>{{ target.artifactLabel }}</span><button @click="downloadArtifact">下载原始文件</button></header><pre>{{ target.artifact }}</pre></section>
          <div class="crypto-metadata"><span><b>ASCII</b>输入字符集</span><span><b>2</b>可能的编码层</span><span><b>UTF-8</b>预期明文</span></div>
        </main>
        <footer class="tool-footer"><span>relay capture ready</span><span>session {{ remaining }}</span></footer>
      </section>
    </template>

    <template v-else-if="target.kind === 'TRAFFIC_CAPTURE'">
      <section class="standalone-tool packet-console">
        <header class="tool-window-bar"><b>PACKET SCOPE</b><span>{{ target.artifactLabel }}</span><em>LIVE {{ remaining }}</em></header>
        <div class="packet-toolbar"><button>打开</button><button @click="downloadArtifact">导出</button><label>显示过滤器</label><input value="http" readonly><span>4 packets</span></div>
        <main class="packet-main">
          <div class="packet-list">
            <div class="packet-head"><span>No.</span><span>Time</span><span>Source</span><span>Method / Path</span><span>Status</span></div>
            <div><span>12</span><span>10:03:01</span><span>assets.local</span><span>GET /app.css</span><span>200</span></div>
            <div><span>18</span><span>10:03:04</span><span>api.local</span><span>GET /profile</span><span>200</span></div>
            <div class="suspicious"><span>23</span><span>10:03:05</span><span>sync.invalid</span><span>POST /export</span><span>500</span></div>
            <div><span>27</span><span>10:03:08</span><span>assets.local</span><span>GET /logo.svg</span><span>304</span></div>
          </div>
          <section class="stream-window"><header><b>Follow HTTP Stream</b><span>stream 23</span></header><pre>{{ target.artifact }}</pre></section>
        </main>
        <footer class="tool-footer"><span>Packets: 4 · Displayed: 4</span><span>local capture</span></footer>
      </section>
    </template>

    <template v-else-if="target.kind === 'REVERSE_BINARY'">
      <section class="standalone-tool reverse-console">
        <header class="tool-window-bar"><b>REV STUDIO</b><span>validator.bin / decompiler</span><em>{{ remaining }}</em></header>
        <div class="reverse-layout">
          <aside><b>Functions</b><button class="active">verify</button><button>main</button><button>print_result</button><hr><b>Symbols</b><button>expected</button><button>input</button></aside>
          <main><div class="code-tabs"><span class="active">Decompiler</span><span>Disassembly</span><button @click="downloadArtifact">导出分析文本</button></div><pre>{{ target.artifact }}</pre></main>
          <aside class="reverse-info"><b>Program info</b><p>ELF 64-bit LSB</p><p>x86-64</p><p>symbols stripped</p><hr><b>References</b><p>expected → verify</p><p>strcmp → PLT</p></aside>
        </div>
        <footer class="tool-footer"><span>analysis complete</span><span>read-only sample</span></footer>
      </section>
    </template>

    <template v-else>
      <section class="standalone-tool pwn-console">
        <header class="tool-window-bar"><b>PWNBOX</b><span>profile-service / tcp:31337</span><em>{{ remaining }}</em></header>
        <main class="pwn-layout">
          <section class="pwn-source"><header><span>profile-service.c</span><button @click="downloadArtifact">下载源码</button></header><pre>{{ target.artifact }}</pre></section>
          <section class="pwn-terminal">
            <div class="terminal-output"><p><b>profile-service</b> connected</p><p>Send one line. Connection closes after each request.</p><pre v-if="output">{{ output }}</pre><p v-if="feedback" :class="{ granted: output.includes('flag{') }">{{ feedback }}</p></div>
            <div class="terminal-command"><span>$</span><input v-model="input" :placeholder="target.inputPlaceholder" spellcheck="false" @keyup.enter="interact"><button :disabled="!input.trim() || submitting" @click="interact">{{ submitting ? '发送中…' : '发送' }}</button></div>
          </section>
        </main>
        <footer class="tool-footer"><span>safe memory-layout simulator</span><span>session {{ remaining }}</span></footer>
      </section>
    </template>
  </section>
</template>
