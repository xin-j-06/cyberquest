<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, apiAuthHeaders, apiBase } from './api';
import { useAuth } from './stores/auth';
import { cacheChallengeNote, challengeNoteKey, loadChallengeNote, saveChallengeNoteCache, type SavedChallengeNote } from './challenge-notes';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const challenge = ref<any>();
const workspace = ref<any>();
const loadError = ref('');
const flag = ref('');
const result = ref('');
const resultTone = ref<'good' | 'error' | ''>('');
const command = ref('');
const action = ref('');
const targetState = ref<'checking' | 'ready' | 'error'>('checking');
const activeWorkspaceTab = ref<'brief' | 'resources' | 'terminal'>('brief');
type ContextTab = 'notes' | 'ai' | 'solution' | 'history';
type GuideStep = { title: string; detail: string; actions: string[]; code?: string; expected: string };
type GuideDocument = { title: string; summary: string; principle: string; steps: GuideStep[] };
const contextTab = ref<ContextTab>('notes');
const noteText = ref('');
const noteDirty = ref(false);
const noteSavedAt = ref('');
const noteSaving = ref(false);
const noteBackendMessage = ref('');
const noteRecordCount = ref(0);
const noteEditor = ref<HTMLTextAreaElement>();
const terminal = ref('本地受控终端已就绪。\n输入「帮助」查看本题允许的学习命令。');
type SandboxPhase = 'idle' | 'starting' | 'running' | 'ready' | 'error';
const sandboxPhase = ref<SandboxPhase>('idle');
const sandboxLines = ref<string[]>([
  'CyberQuest CTF Range v3.0',
  '靶场尚未启动。点击「启动靶场」创建当前题目的独立会话。',
]);
let sandboxRunId = 0;
let statusPoll: ReturnType<typeof setInterval> | undefined;

const categoryNames: Record<string, string> = {
  WEB: '网页安全', CRYPTO: '密码学', NETWORK: '网络分析', REVERSE: '逆向工程', PWN: '二进制安全',
};
const canWork = computed(() => challenge.value?.available !== false);
const session = computed(() => workspace.value?.session ?? challenge.value?.workspaceStatus ?? {});
const sessionRunning = computed(() => session.value?.running === true || session.value?.status === 'RUNNING');
const targetHref = computed(() => {
  const value = session.value?.accessUrl ?? challenge.value?.labUrl;
  if (!value) return '';
  try { return new URL(value, window.location.origin).toString(); } catch { return ''; }
});
const resourceHealth = computed(() => workspace.value?.resourceHealth ?? challenge.value?.resourceHealth);
const recentAttempts = computed(() => workspace.value?.recentSubmissions ?? challenge.value?.attempts ?? []);
const attemptStats = computed(() => workspace.value?.submissionStats ?? challenge.value?.submissionStats);
const sessionStateText = computed(() => {
  if (session.value?.requiresLogin === true || !auth.token) return '登录后可启动';
  if (sessionRunning.value) return '受控会话运行中';
  if (session.value?.status === 'EXPIRED') return '会话已到期';
  if (session.value?.status === 'STOPPED') return '会话已结束';
  return '尚未启动';
});
const sandboxReady = computed(() => sandboxPhase.value === 'ready' && sessionRunning.value && Boolean(targetHref.value));
const sandboxStateText = computed(() => ({
  idle: 'WAITING', starting: 'STARTING', running: 'STREAMING', ready: 'READY', error: 'FAILED',
})[sandboxPhase.value]);
const generatedSolveLink = computed(() => targetHref.value || '#flag-submit');
const officialGuide = computed(() => challenge.value?.hints?.[0]);
const guideDocument = computed<GuideDocument | undefined>(() => {
  const content = officialGuide.value?.content;
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.steps)) return parsed as GuideDocument;
  } catch {
    return { title: officialGuide.value.title, summary: content, principle: '', steps: [] };
  }
  return undefined;
});
const sandboxSteps = computed(() => [
  `[BOOT] 正在为 ${challenge.value?.slug ?? 'challenge'} 创建隔离运行空间...`,
  `[AUTH] 已绑定本地学员：${auth.user?.username ?? '未登录用户'}`,
  `[POLICY] 只读材料、受控命令与会话时限策略加载完成。`,
  `[LOAD] 正在读取「${challenge.value?.title ?? '当前题目'}」的任务目标与可用资源...`,
  `[TRACE] 已建立输入 → 处理 → 输出的证据追踪通道。`,
]);
const noteStorageKey = computed(() => challengeNoteKey(auth.user?.id ?? 'anonymous', String(route.params.id)));
const noteStatusText = computed(() => {
  if (noteSaving.value) return '正在同步到账号后端…';
  if (noteBackendMessage.value) return noteBackendMessage.value;
  if (noteDirty.value) return '有未保存修改';
  return noteSavedAt.value ? `已新增第 ${noteRecordCount.value} 条笔记 · ${noteSavedAt.value}` : noteRecordCount.value ? `已保存 ${noteRecordCount.value} 条笔记记录` : '尚未保存到账号';
});

function showResult(message: string, tone: 'good' | 'error' | '' = '') {
  result.value = message;
  resultTone.value = tone;
}

function formatTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function restoreNote() {
  const userId = auth.user?.id ?? '';
  const slug = String(route.params.id);
  let saved = loadChallengeNote(userId, slug);
  const legacyContent = localStorage.getItem(`cq_challenge_note_${slug}`) ?? '';
  const cachedContent = saved?.content ?? localStorage.getItem(noteStorageKey.value) ?? legacyContent;
  noteBackendMessage.value = '';
  if (userId) {
    try {
      const response = await api<SavedChallengeNote[]>(`/challenges/${slug}/notes`);
      noteRecordCount.value = response.length;
      response.forEach((note) => cacheChallengeNote(userId, note));
      saved = undefined;
    } catch {
      noteBackendMessage.value = cachedContent ? '后端暂不可用，已载入本地缓存' : '笔记服务暂不可用';
    }
  }
  noteText.value = noteBackendMessage.value ? (saved?.content ?? cachedContent) : '';
  noteDirty.value = false;
  noteSavedAt.value = saved?.updatedAt ? new Date(saved.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
}

async function saveNote() {
  const userId = auth.user?.id ?? '';
  const draft = {
    id: '',
    slug: String(route.params.id),
    challengeTitle: challenge.value?.title ?? String(route.params.id),
    category: categoryNames[challenge.value?.category] ?? challenge.value?.category ?? 'CTF',
    content: noteText.value,
  };
  noteSaving.value = true;
  noteBackendMessage.value = '';
  try {
    if (!noteText.value.trim()) throw new Error('请先输入笔记内容');
    const response = await api<SavedChallengeNote>(`/challenges/${route.params.id}/notes`, { method: 'POST', body: JSON.stringify({ content: noteText.value }) });
    const saved = cacheChallengeNote(userId, response);
    noteRecordCount.value += 1;
    noteDirty.value = false;
    noteSavedAt.value = saved ? new Date(saved.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    noteText.value = '';
  } catch (error: any) {
    saveChallengeNoteCache(userId, draft);
    noteBackendMessage.value = error.message ? `同步失败：${error.message}` : '同步失败，本地草稿已保留';
  } finally {
    noteSaving.value = false;
  }
}

async function formatNote(prefix: string, suffix = prefix) {
  const editor = noteEditor.value;
  if (!editor) return;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = noteText.value.slice(start, end);
  noteText.value = `${noteText.value.slice(0, start)}${prefix}${selected}${suffix}${noteText.value.slice(end)}`;
  noteDirty.value = true;
  await nextTick();
  editor.focus();
  editor.setSelectionRange(start + prefix.length, end + prefix.length);
}

function insertNoteBlock(value: string) {
  const editor = noteEditor.value;
  if (!editor) return;
  const start = editor.selectionStart;
  const lineStart = noteText.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  noteText.value = `${noteText.value.slice(0, lineStart)}${value}${noteText.value.slice(lineStart)}`;
  noteDirty.value = true;
  nextTick(() => editor.focus());
}

async function checkTarget() {
  if (!targetHref.value) { targetState.value = 'ready'; return; }
  targetState.value = 'checking';
  try {
    const response = await fetch(targetHref.value, { method: 'GET' });
    targetState.value = response.ok ? 'ready' : 'error';
  } catch {
    targetState.value = 'error';
  }
}

async function syncWorkspace() {
  if (!auth.token) return;
  workspace.value = await api(`/challenges/${route.params.id}/workspace`);
}

async function syncSessionStatus() {
  if (!auth.token || !challenge.value) return;
  const snapshot: any = await api(`/labs/${route.params.id}/status`);
  workspace.value = { ...workspace.value, session: snapshot.session, resourceHealth: snapshot.resourceHealth };
  if (snapshot.session?.running) restoreSandboxSession();
  else if (sandboxPhase.value === 'ready') resetSandbox('会话已结束，可重新启动靶场。');
}

async function load() {
  try {
    loadError.value = '';
    challenge.value = await api(`/challenges/${route.params.id}`);
    workspace.value = challenge.value.workspace;
    if (auth.token) await syncWorkspace();
    restoreSandboxSession();
    await checkTarget();
    await restoreNote();
  } catch (error: any) {
    loadError.value = error.message || '无法连接训练服务。请确认本地后端仍在运行。';
  }
}

function updateScore(score: number) {
  if (!auth.user) return;
  auth.user = { ...auth.user, score };
  sessionStorage.setItem('cq_user', JSON.stringify(auth.user));
}

async function submit() {
  if (!auth.token) { showResult('请先登录后再提交答案。', 'error'); return; }
  try {
    const response: any = await api(`/challenges/${route.params.id}/submit`, { method: 'POST', body: JSON.stringify({ flag: flag.value }) });
    if (response.newScore !== undefined) updateScore(response.newScore);
    if (response.success) {
      const wasSolved = challenge.value.solved;
      challenge.value.solved = true;
      if (!wasSolved) challenge.value.solves = (challenge.value.solves ?? 0) + 1;
      challenge.value.attempts = response.attempts;
      flag.value = '';
      result.value = '';
      resultTone.value = '';
      await syncWorkspace();
      await stopSession('solved');
      await load();
    } else {
      challenge.value.attempts = response.attempts;
      showResult(response.message || '答案未通过，请回到题目目标检查证据链。', 'error');
      await syncWorkspace();
    }
  } catch (error: any) {
    showResult(error.message || '提交失败，请稍后再试。', 'error');
  }
}

async function startSession(): Promise<boolean> {
  if (!auth.token) { await router.push({ path: '/login', query: { redirect: route.fullPath } }); return false; }
  try {
    const response: any = await api('/labs/start', { method: 'POST', body: JSON.stringify({ challengeId: route.params.id }) });
    workspace.value = { ...workspace.value, session: response };
    showResult(response.message || '本地受控学习会话已启动。', 'good');
    return Boolean(response.running && response.accessUrl);
  } catch (error: any) {
    showResult(error.message || '会话启动失败。', 'error');
    return false;
  }
}

function waitForSandboxStep(milliseconds: number, runId: number) {
  return new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(runId === sandboxRunId), milliseconds);
  });
}

function resetSandbox(message = '靶场尚未启动。点击「启动靶场」创建当前题目的独立会话。') {
  sandboxRunId += 1;
  sandboxPhase.value = 'idle';
  sandboxLines.value = ['CyberQuest CTF Range v3.0', message];
}

function restoreSandboxSession() {
  if (!sessionRunning.value || !targetHref.value || !['idle', 'error'].includes(sandboxPhase.value)) return;
  sandboxPhase.value = 'ready';
  sandboxLines.value = [
    'CyberQuest CTF Range v3.0',
    `[SESSION] 已恢复当前题目的独立靶场会话：${session.value.instanceId ?? 'active'}`,
    `[URL] ${targetHref.value}`,
    '[READY] 靶场入口可用，找到 Flag 后返回工作台提交。',
  ];
}

async function launchSandbox() {
  if (sandboxPhase.value === 'starting' || sandboxPhase.value === 'running') return;
  sandboxRunId += 1;
  const runId = sandboxRunId;
  sandboxPhase.value = 'starting';
  sandboxLines.value = ['$ cq-range start --challenge'];

  const sessionAvailable = sessionRunning.value || await startSession();
  if (!sessionAvailable || runId !== sandboxRunId) {
    sandboxPhase.value = 'error';
    sandboxLines.value.push('[ERROR] 无法建立本地训练会话，请确认登录状态后重试。');
    return;
  }

  sandboxPhase.value = 'running';
  for (const line of sandboxSteps.value) {
    if (!await waitForSandboxStep(560, runId)) return;
    sandboxLines.value.push(line);
  }
  if (runId !== sandboxRunId) return;
  if (!targetHref.value) {
    sandboxPhase.value = 'error';
    sandboxLines.value.push('[ERROR] 后端未返回解题网址，请重新启动会话。');
    return;
  }
  sandboxLines.value.push(`[URL] ${targetHref.value}`);
  if (!await waitForSandboxStep(360, runId)) return;
  sandboxLines.value.push('[READY] 环境检查通过，独立 CTF 靶场入口已生成。');
  sandboxPhase.value = 'ready';
}

function openSolveTarget(event: MouseEvent) {
  if (targetHref.value) return;
  event.preventDefault();
  document.querySelector('#flag-submit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function stopSession(reason: 'manual' | 'solved' = 'manual') {
  if (action.value) return;
  action.value = 'stop-session';
  sandboxRunId += 1;
  try {
    const response: any = await api(`/labs/${route.params.id}/stop`, { method: 'POST' });
    workspace.value = { ...workspace.value, session: response.session };
    resetSandbox(reason === 'solved' ? 'Flag 验证通过，本次靶场会话已自动结束。' : '本次答题已结束，会话资源已由后端释放。');
    result.value = '';
    resultTone.value = '';
  } catch (error: any) {
    showResult(error.message || (reason === 'solved' ? '答题已通过，但靶场自动结束失败，请手动结束。' : '结束会话失败。'), 'error');
  } finally {
    action.value = '';
  }
}

async function unlock(hint: any) {
  if (hint.unlocked) return;
  if (!auth.token) { showResult('登录后才能用积分解锁提示。', 'error'); return; }
  action.value = hint.id;
  try {
    const response: any = await api(`/challenges/${route.params.id}/hints/${hint.id}/unlock`, { method: 'POST' });
    hint.unlocked = true;
    hint.content = response.content;
    updateScore(response.newScore);
    showResult(`已解锁提示，扣除 ${response.cost || 0} 积分。`, 'good');
    await syncWorkspace();
  } catch (error: any) {
    showResult(error.message || '提示暂时无法解锁。', 'error');
  } finally {
    action.value = '';
  }
}

function run() {
  const item = command.value.trim();
  if (!item) return;
  const commands: Record<string, string> = {
    帮助: '可用命令：帮助、任务目标、资源、我的状态、提示、清屏。',
    任务目标: challenge.value?.goal || '任务尚未加载。',
    资源: `${targetHref.value ? '网页靶场：资源区已提供受控本地链接。\n' : ''}${challenge.value?.attachments?.length ? `附件：${challenge.value.attachments.map((file: any) => file.label).join('、')}` : '本题没有附加文件。'}`,
    我的状态: auth.user ? `当前学员：${auth.user.username}\n积分：${auth.user.score ?? 0}\n训练会话：${sessionStateText.value}` : '尚未登录。',
    提示: challenge.value?.hints?.some((hint: any) => hint.unlocked) ? '官方题解已开放，请在右侧“官方题解”页签查看完整步骤。' : '官方题解尚未开放：可使用 20 积分解锁，答题成功后则免费查看。',
  };
  terminal.value = item === '清屏' ? '' : `${terminal.value}\n\n$ ${item}\n${commands[item] || '该命令不在允许列表中。输入「帮助」查看可用命令。'}`;
  command.value = '';
}

async function copyTarget() {
  try {
    await navigator.clipboard.writeText(targetHref.value);
    showResult('靶场链接已复制。局域网访问时，请把主机名替换为运行平台电脑的 IP。', 'good');
  } catch {
    showResult('浏览器未授予复制权限，请手动复制上方地址。', 'error');
  }
}

function formatBytes(value?: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

async function downloadAttachment(file: any) {
  if (!auth.token) { showResult('登录后才能下载训练附件。', 'error'); return; }
  try {
    const response = await fetch(`${apiBase}${file.url}`, { headers: apiAuthHeaders() });
    if (!response.ok) throw new Error('附件下载失败');
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    showResult(`已下载附件：${file.label}`, 'good');
  } catch (error: any) {
    showResult(error.message || '附件下载失败，请确认后端仍在运行。', 'error');
  }
}

onMounted(() => {
  load();
  statusPoll = setInterval(() => { syncSessionStatus().catch(() => undefined); }, 30000);
});
onUnmounted(() => {
  sandboxRunId += 1;
  if (statusPoll) clearInterval(statusPoll);
});
</script>

<template>
  <section v-if="challenge" class="page workspace-page focus-workspace">
    <header class="challenge-banner">
      <div class="task-title">
        <span class="eyebrow">训练工作台 / {{ categoryNames[challenge.category] || challenge.category }}</span>
        <h1>{{ challenge.title }}</h1>
        <p>{{ challenge.description }}</p>
        <div class="banner-tags"><i v-for="tag in challenge.tags" :key="tag">{{ tag }}</i></div>
      </div>
      <div class="banner-score">
        <span>本题积分</span><b>{{ challenge.points }}</b>
        <em :class="{ done: challenge.solved }">{{ challenge.solved ? '已完成' : '待验证' }}</em>
      </div>
    </header>

    <div class="workspace-layout challenge-workbench">
      <main class="challenge-surface">
        <section class="goal-panel">
          <div>
            <span class="eyebrow">任务目标</span>
            <h2>{{ challenge.goal }}</h2>
          </div>
          <div class="goal-status">
            <span>有效完成</span>
            <b>{{ challenge.solves }} 次</b>
          </div>
        </section>

        <nav class="workspace-tabs" aria-label="训练工作区">
          <button type="button" :class="{ active: activeWorkspaceTab === 'brief' }" @click="activeWorkspaceTab = 'brief'">
            <span>题目说明</span><small>目标与验证</small>
          </button>
          <button type="button" :class="{ active: activeWorkspaceTab === 'resources' }" @click="activeWorkspaceTab = 'resources'">
            <span>资源与靶场</span><small>{{ (challenge.connection ? 1 : 0) + (challenge.attachments?.length || 0) }} 项材料</small>
          </button>
          <button type="button" :class="{ active: activeWorkspaceTab === 'terminal' }" @click="activeWorkspaceTab = 'terminal'">
            <span>受控终端</span><small>本题命令</small>
          </button>
        </nav>

        <section v-show="activeWorkspaceTab === 'brief'" class="work-main">
          <header class="work-main-header">
            <div>
              <span class="eyebrow">CTF 靶场</span>
              <h2>启动靶场，寻找会话 Flag</h2>
            </div>
            <span class="submission-count">{{ attemptStats?.total ?? recentAttempts.length }} 次提交</span>
          </header>

          <section class="solve-flow sandbox-flow">
            <div v-if="challenge.solved" class="solve-success-notice" role="status">
              <i>✓</i>
              <div>
                <b>答题成功，积分已记录</b>
                <p>本次靶场会话已自动结束；需要继续复盘或再次答题时，可以重新启动靶场。</p>
              </div>
            </div>
            <div class="sandbox-toolbar">
              <div><i></i><i></i><i></i><span>solver@cyberquest:~/{{ challenge.slug }}</span></div>
              <em :class="sandboxPhase">{{ sandboxStateText }}</em>
            </div>
            <div class="sandbox-screen" aria-live="polite">
              <p v-for="(line, index) in sandboxLines" :key="index" :class="{ ready: line.startsWith('[READY]'), url: line.startsWith('[URL]'), error: line.startsWith('[ERROR]') }">
                <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ line }}
              </p>
              <b v-if="sandboxPhase === 'starting' || sandboxPhase === 'running'" class="sandbox-cursor"></b>
            </div>
            <div class="sandbox-actions">
              <div>
                <b>{{ sandboxReady ? '靶场入口已就绪' : '等待启动独立靶场' }}</b>
                <small>{{ sandboxReady ? '进入目标页分析漏洞或材料，自行找到 Flag。' : '日志将逐条输出，完成后生成会话专属入口。' }}</small>
              </div>
              <button v-if="!sandboxReady" :disabled="sandboxPhase === 'starting' || sandboxPhase === 'running' || !canWork" @click="launchSandbox">
                {{ sandboxPhase === 'starting' || sandboxPhase === 'running' ? '靶场启动中…' : sandboxPhase === 'error' ? '重新启动' : '启动靶场' }}
              </button>
              <div v-else class="sandbox-ready-actions">
                <a :href="generatedSolveLink" @click="openSolveTarget">
                  <span>靶场网址</span><b>{{ targetHref }}</b><i>→</i>
                </a>
                <button class="sandbox-stop-button" :disabled="action === 'stop-session'" @click="stopSession()">
                  {{ action === 'stop-session' ? '正在结束…' : '结束答题' }}
                </button>
              </div>
            </div>

            <section id="flag-submit" class="flag-submit-panel" :class="{ locked: !sandboxReady }">
              <header>
                <div><i>04</i><span><b>提交 Flag</b><small>在独立靶场中完成漏洞利用或材料分析，找到 Flag 后在这里验证。</small></span></div>
                <em>{{ sandboxReady ? '可以提交' : '等待靶场' }}</em>
              </header>
              <div class="submit-row flag-submit-row">
                <input v-model="flag" :disabled="!canWork || !sandboxReady" @keyup.enter="submit" :placeholder="sandboxReady ? '输入 flag{...}' : '启动靶场后开放提交'">
                <button :disabled="!canWork || !sandboxReady" @click="submit">提交答案</button>
              </div>
            </section>
          </section>

          <p v-if="result" class="result" :class="resultTone">{{ result }}</p>
        </section>

        <section v-show="activeWorkspaceTab === 'resources'" class="access-panel">
          <header><span class="eyebrow">训练资源</span><small>仅展示本题已登记的本地材料</small></header>
          <template v-if="challenge.connection || challenge.attachments?.length">
            <div v-if="challenge.connection" class="access-item">
              <span class="access-mark">↗</span>
              <div>
                <small>受控连接 / {{ challenge.connection.protocol }}</small><b>{{ challenge.connection.label }}</b>
                <p>{{ challenge.connection.description }}</p><code>{{ targetHref }}</code>
              </div>
              <div class="access-actions">
                <span class="target-health" :class="targetState">{{ targetState === 'ready' ? '靶场响应正常' : targetState === 'error' ? '靶场不可达' : '检测中' }}</span>
                <a :href="targetHref">打开靶场</a><button class="outline" @click="copyTarget">复制地址</button>
              </div>
            </div>
            <div v-for="file in challenge.attachments" :key="file.name" class="access-item file">
              <span class="access-mark">⌁</span>
              <div><small>{{ file.kind }}</small><b>{{ file.label }}</b><p>{{ file.name }} · {{ formatBytes(file.size) }}</p></div>
              <button class="outline" @click="downloadAttachment(file)">下载附件</button>
            </div>
          </template>
          <div v-else class="resource-empty">
            <b>本题不需要外部材料</b>
            <p>所有必要线索都在题目说明或受控终端中提供。</p>
          </div>
          <div v-if="resourceHealth" class="resource-note" :class="resourceHealth.status?.toLowerCase()">
            <span>{{ resourceHealth.status === 'READY' ? '本地材料已登记' : '材料状态需要注意' }}</span>
            <small>后端仅核验当前训练材料的本地元数据，不对外部地址发起探测。</small>
          </div>
        </section>

        <section v-show="activeWorkspaceTab === 'terminal'" class="terminal-block">
          <header><div><b>本地受控终端</b><small>仅支持本题学习命令</small></div><span>LOCAL</span></header>
          <pre>{{ terminal }}</pre><input v-model="command" @keyup.enter="run" placeholder="帮助、任务目标、资源、我的状态、提示">
        </section>
      </main>

      <aside class="work-context context-workbench">
        <nav class="context-tabs" aria-label="解题辅助面板">
          <button :class="{ active: contextTab === 'notes' }" @click="contextTab = 'notes'"><i>▣</i><span>题目笔记</span></button>
          <button :class="{ active: contextTab === 'ai' }" @click="contextTab = 'ai'"><i>✦</i><span>AI 分析</span></button>
          <button :class="{ active: contextTab === 'solution' }" @click="contextTab = 'solution'"><i>▤</i><span>官方题解</span></button>
          <button :class="{ active: contextTab === 'history' }" @click="contextTab = 'history'"><i>↶</i><span>解题记录</span><em v-if="recentAttempts.length">{{ recentAttempts.length }}</em></button>
          <button v-if="contextTab === 'notes'" class="save-note" :disabled="!noteDirty || noteSaving" @click="saveNote">{{ noteSaving ? '保存中…' : '保存笔记' }}</button>
        </nav>

        <section v-show="contextTab === 'notes'" class="context-pane notes-pane">
          <div class="note-toolbar" aria-label="笔记格式工具">
            <button title="标题" @click="insertNoteBlock('## ')">H</button>
            <button title="加粗" @click="formatNote('**')"><b>B</b></button>
            <button title="斜体" @click="formatNote('_')"><i>I</i></button>
            <button title="删除线" @click="formatNote('~~')"><s>S</s></button>
            <span></span>
            <button title="无序列表" @click="insertNoteBlock('- ')">☷</button>
            <button title="有序列表" @click="insertNoteBlock('1. ')">☰</button>
            <button title="行内代码" @click="formatNote('`')">&lt;/&gt;</button>
            <button title="引用" @click="insertNoteBlock('> ')">❯</button>
          </div>
          <textarea ref="noteEditor" v-model="noteText" @input="noteDirty = true" placeholder="在这里记录请求字段、响应差异、验证过程和 Flag 推导依据…"></textarea>
          <footer><span :class="{ dirty: noteDirty, error: noteBackendMessage.startsWith('同步失败') }">{{ noteStatusText }}</span><small>{{ noteText.length }} 字</small></footer>
        </section>

        <section v-show="contextTab === 'ai'" class="context-pane ai-pane">
          <div class="pane-intro"><span class="eyebrow">AI AGENT CENTER</span><h3>进入统一智能体中心</h3><p>当前题目上下文会自动带入智能体中心。你可以连续追问分析思路、工具用法和错误排查，不会直接泄露 Flag。</p></div>
          <div class="pane-empty"><i>AI</i><b>已关联「{{ challenge?.title }}」</b><p>先在左侧靶场收集证据，再把观察带到智能体中心建立验证路径。</p></div>
          <RouterLink class="workspace-agent-link" :to="{path:'/agent',query:{challenge:String(route.params.id)}}">打开 AI 智能体 <span>→</span></RouterLink>
        </section>

        <section v-show="contextTab === 'solution'" class="context-pane solution-pane">
          <div class="pane-intro"><span class="eyebrow">OFFICIAL WRITEUP</span><h3>本题官方解题步骤</h3><p>题解与当前靶场机制一致，包含原理、复现流程、代码和预期结果，但不会直接写出会话 Flag。</p></div>

          <section v-if="officialGuide && !officialGuide.unlocked" class="guide-lock-card">
            <i>▤</i>
            <b>{{ officialGuide.title }}</b>
            <p>解锁后可查看完整复现步骤。答题成功会自动开放，无需消耗积分。</p>
            <button :disabled="!!action" @click="unlock(officialGuide)">{{ action === officialGuide.id ? '正在解锁…' : '20 积分解锁完整题解' }}</button>
            <small>当前积分：{{ auth.user?.score ?? 0 }}</small>
          </section>

          <div v-else-if="officialGuide && guideDocument" class="guide-document">
            <header class="guide-summary">
              <div><span>{{ challenge.solved ? '通关后免费开放' : '已解锁' }}</span><h4>{{ guideDocument.title }}</h4></div>
              <i>✓</i>
              <p>{{ guideDocument.summary }}</p>
            </header>
            <section class="guide-principle"><small>核心原理</small><p>{{ guideDocument.principle }}</p></section>
            <ol class="guide-steps">
              <li v-for="(step, index) in guideDocument.steps" :key="step.title">
                <header><i>{{ String(index + 1).padStart(2, '0') }}</i><div><small>STEP {{ index + 1 }}</small><b>{{ step.title }}</b></div></header>
                <p>{{ step.detail }}</p>
                <ul><li v-for="item in step.actions" :key="item">{{ item }}</li></ul>
                <pre v-if="step.code"><code>{{ step.code }}</code></pre>
                <div class="guide-expected"><span>预期结果</span><p>{{ step.expected }}</p></div>
              </li>
            </ol>
            <footer><i>✓</i><p><b>复现完成</b><span>从靶场响应或还原结果中复制当前会话 Flag，返回左侧提交。</span></p></footer>
          </div>

          <div v-else class="pane-empty"><i>▤</i><b>官方题解暂不可用</b><p>请刷新页面或确认后端服务正在运行。</p></div>
        </section>

        <section v-show="contextTab === 'history'" class="context-pane history-pane">
          <div class="history-list">
            <header><div><span class="eyebrow">提交历史</span><b>{{ attemptStats?.total ?? recentAttempts.length }} 次记录</b></div></header>
            <article v-for="attempt in recentAttempts" :key="attempt.id"><i :class="{ ok: attempt.correct }">{{ attempt.correct ? '✓' : '×' }}</i><div><b>{{ attempt.correct ? 'Flag 验证通过' : 'Flag 尚未通过' }}</b><small>{{ formatTime(attempt.createdAt) }}</small></div></article>
            <div v-if="!recentAttempts.length" class="pane-empty"><i>↶</i><b>暂无提交记录</b><p>从左侧靶场找到 Flag 后，在提交区进行第一次验证。</p></div>
          </div>
        </section>
      </aside>
    </div>
  </section>
  <section v-else class="page load-state"><div v-if="loadError"><h2>训练任务未能加载</h2><p>{{ loadError }}</p><button @click="load">重新加载</button></div><p v-else>正在载入训练任务…</p></section>
</template>
