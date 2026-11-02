<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from './api';
import { useAuth } from './stores/auth';

type SkillNode = { slug: string; name: string; category: string; description: string };
type SkillProgress = { skill: SkillNode; xp: number; level: number; status: string };
type SkillGraph = { nodes: SkillNode[]; edges: unknown[] };
type SkillMeta = { label: string; code: string; stage: string; stageIndex: string; domain: string; summary: string; prerequisite: string; nextStep: string; topics: string[]; outcomes: string[]; evidence: string[]; challengeCount: number; duration: string };

const auth = useAuth();
const graph = ref<SkillGraph>();
const progress = ref<SkillProgress[]>([]);
const focusSlug = ref('');
const stageFilter = ref('全部能力');
const loading = ref(true);
const error = ref('');

const skillMeta: Record<string, SkillMeta> = {
  http: {
    label: 'HTTP 与信任边界', code: 'WEB-01', stage: '基础能力', stageIndex: 'L1', domain: 'web',
    summary: '理解请求生命周期、会话状态、身份认证与访问控制之间的边界。', prerequisite: '了解浏览器、URL 与客户端 / 服务端基本模型。', nextStep: '完成报文分析后，进入流量分析或 Web API 安全专题。',
    topics: ['HTTP 消息', '参数边界', '会话状态', '访问控制'], outcomes: ['标注客户端可控字段与服务端生成字段', '解释 Cookie 关键安全属性', '区分认证与授权检查', '通过单变量重放验证请求差异'], evidence: ['带注释的请求 / 响应样本', '信任边界图', '会话与权限校验复盘'], challengeCount: 2, duration: '3–4 小时',
  },
  'crypto-basics': {
    label: '编码与密码基础', code: 'CRYPTO-01', stage: '基础能力', stageIndex: 'L1', domain: 'crypto',
    summary: '区分编码、摘要、消息认证与加密，建立可靠的数据表示能力。', prerequisite: '掌握字节、文本与常用进制表示。', nextStep: '进入对称密码、RSA 或文件取证专题。',
    topics: ['字节与编码', 'Hash 与 HMAC', '对称密码', '公钥基础'], outcomes: ['完成常见数据表示的无损转换', '说明密码机制的安全目标差异', '识别关键参数与随机数', '通过验签或校验值确认结果'], evidence: ['逐层解码记录', '密码机制对比表', '可重复运行的验证脚本'], challengeCount: 1, duration: '4–5 小时',
  },
  'packet-analysis': {
    label: '网络流量分析', code: 'FORENSICS-02', stage: '分析能力', stageIndex: 'L2', domain: 'forensics',
    summary: '从协议层级、会话关系与时间线中整理可复核的网络证据。', prerequisite: '建议先完成 HTTP 与信任边界。', nextStep: '继续日志关联、文件提取与入侵事件时间线。',
    topics: ['协议分层', '过滤统计', '会话重组', '事件时间线'], outcomes: ['说明抓包范围与完整性限制', '定位关键协议字段', '按五元组重组连接', '将网络事件与日志统一成时间线'], evidence: ['可复用过滤器', '会话时间线', '包含包号依据的异常说明'], challengeCount: 1, duration: '4–6 小时',
  },
  'reverse-basics': {
    label: '程序静态分析', code: 'REVERSE-02', stage: '分析能力', stageIndex: 'L2', domain: 'reverse',
    summary: '通过文件结构、导入、字符串与控制流建立并验证程序行为假设。', prerequisite: '具备 Linux 命令行和程序执行基础。', nextStep: '进入移动端逆向、保护机制识别或内存安全。',
    topics: ['可执行格式', '函数与引用', '伪代码', '动态验证'], outcomes: ['识别文件架构与入口', '定位核心函数逻辑', '整理输入与分支关系', '使用最少断点验证判断'], evidence: ['样本结构清单', '关键函数调用图', '逻辑复原记录'], challengeCount: 1, duration: '5–7 小时',
  },
  'memory-safety': {
    label: '内存安全基础', code: 'SYSTEM-03', stage: '进阶能力', stageIndex: 'L3', domain: 'pwn',
    summary: '从对象布局、长度与生命周期解释内存错误，并理解防护机制边界。', prerequisite: '完成静态分析并理解栈帧与调用约定。', nextStep: '继续学习安全编码、堆分配器与防护机制验证。',
    topics: ['进程内存', '栈与边界', '对象生命周期', '防护机制'], outcomes: ['描述缓冲区与栈帧关系', '从崩溃信息定位内存错误', '说明常见防护机制作用', '提出代码层修复方案'], evidence: ['稳定复现的最小输入', '崩溃现场记录', '根因与修复验证说明'], challengeCount: 1, duration: '6–8 小时',
  },
};

const filters = ['全部能力', '基础能力', '分析能力', '进阶能力'];
const nodes = computed(() => (graph.value?.nodes ?? []).filter((node) => skillMeta[node.slug]));
const visibleNodes = computed(() => nodes.value.filter((node) => stageFilter.value === '全部能力' || skillMeta[node.slug].stage === stageFilter.value));
const focus = computed(() => nodes.value.find((node) => node.slug === focusSlug.value) ?? nodes.value[0]);
const currentMeta = computed(() => focus.value ? skillMeta[focus.value.slug] : undefined);
const totalXp = computed(() => progress.value.reduce((sum, item) => sum + Number(item.xp || 0), 0));
const masteredCount = computed(() => nodes.value.filter((node) => skillPercent(node) >= 100).length);
const activeCount = computed(() => nodes.value.filter((node) => skillXp(node) > 0 && skillPercent(node) < 100).length);
const averageProgress = computed(() => nodes.value.length ? Math.round(nodes.value.reduce((sum, node) => sum + skillPercent(node), 0) / nodes.value.length) : 0);
const learningRoute = computed(() => ({ path: '/learning', query: { domain: currentMeta.value?.domain ?? 'web' } }));

function skillProgress(node: SkillNode) { return progress.value.find((item) => item.skill.slug === node.slug); }
function skillXp(node: SkillNode) { return skillProgress(node)?.xp ?? 0; }
function skillLevel(node: SkillNode) { return skillProgress(node)?.level ?? 1; }
function skillPercent(node: SkillNode) { return Math.min(100, skillXp(node)); }
function skillStatus(node: SkillNode) { const xp = skillXp(node); return xp >= 100 ? '已达标' : xp > 0 ? '进行中' : '待发展'; }
function statusClass(node: SkillNode) { return skillXp(node) >= 100 ? 'is-complete' : skillXp(node) > 0 ? 'is-active' : 'is-pending'; }
function selectSkill(node: SkillNode) { focusSlug.value = node.slug; requestAnimationFrame(() => document.querySelector('.capability-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }

async function load() {
  loading.value = true; error.value = '';
  try {
    graph.value = await api<SkillGraph>('/skills');
    if (auth.token) { try { progress.value = await api<SkillProgress[]>('/users/me/skills'); } catch { progress.value = []; } }
    focusSlug.value = graph.value.nodes.find((node) => skillXp(node) > 0)?.slug ?? graph.value.nodes[0]?.slug ?? '';
  } catch (cause: any) { error.value = cause?.message || '能力数据暂时无法加载。'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <main v-if="graph && focus && currentMeta" class="capability-page">
    <header class="capability-hero">
      <div><span class="capability-eyebrow">CAPABILITY MANAGEMENT</span><h1>能力中心</h1><p>基于训练记录形成个人能力基线，识别能力缺口，并给出下一阶段的学习行动。</p></div>
      <div class="capability-hero-actions"><span><i></i> 数据已同步</span><RouterLink to="/learning">进入学习中心</RouterLink></div>
    </header>

    <section class="capability-kpis" aria-label="能力概览">
      <article><span>综合完成度</span><b>{{ averageProgress }}<small>%</small></b><p>覆盖 {{ nodes.length }} 项核心能力</p></article>
      <article><span>已达标</span><b>{{ masteredCount }}<small> 项</small></b><p>满足当前阶段掌握标准</p></article>
      <article><span>进行中</span><b>{{ activeCount }}<small> 项</small></b><p>已有训练记录的能力</p></article>
      <article><span>累计经验</span><b>{{ totalXp }}<small> XP</small></b><p>来自已完成的训练任务</p></article>
    </section>

    <section class="capability-workbench">
      <header class="capability-section-head">
        <div><h2>个人能力矩阵</h2><p>用统一标准查看当前水平、差距和建议行动</p></div>
        <nav aria-label="能力层级筛选"><button v-for="item in filters" :key="item" type="button" :class="{ active: stageFilter === item }" @click="stageFilter = item">{{ item }}</button></nav>
      </header>
      <div class="capability-table" role="table" aria-label="个人能力矩阵">
        <div class="capability-table-head" role="row"><span>能力项</span><span>能力层级</span><span>当前状态</span><span>熟练度</span><span>建议行动</span><span></span></div>
        <button v-for="node in visibleNodes" :key="node.slug" type="button" :class="['capability-row', { selected: focus.slug === node.slug }]" role="row" @click="selectSkill(node)">
          <span class="capability-name"><i>{{ skillMeta[node.slug].code.slice(0, 2) }}</i><b>{{ skillMeta[node.slug].label }}<small>{{ skillMeta[node.slug].code }}</small></b></span>
          <span><em class="capability-level">{{ skillMeta[node.slug].stageIndex }} · {{ skillMeta[node.slug].stage }}</em></span>
          <span><em :class="['capability-status', statusClass(node)]"><i></i>{{ skillStatus(node) }}</em></span>
          <span class="capability-progress-cell"><b>{{ skillPercent(node) }}%</b><i><span :style="{ width: `${skillPercent(node)}%` }"></span></i></span>
          <span class="capability-action-copy">{{ skillMeta[node.slug].nextStep }}</span><span class="capability-chevron">›</span>
        </button>
      </div>
    </section>

    <section class="capability-detail" aria-live="polite">
      <header>
        <div class="capability-detail-title"><span>{{ currentMeta.code }}</span><h2>{{ currentMeta.label }}</h2><p>{{ currentMeta.summary }}</p></div>
        <div class="capability-detail-score"><span>当前熟练度</span><b>{{ skillPercent(focus) }}%</b><small>Lv.{{ skillLevel(focus) }} · {{ skillXp(focus) }} XP</small></div>
      </header>
      <div class="capability-detail-grid">
        <article><span class="capability-detail-label">掌握标准</span><ul><li v-for="outcome in currentMeta.outcomes" :key="outcome"><i>✓</i>{{ outcome }}</li></ul></article>
        <article><span class="capability-detail-label">评估证据</span><ol><li v-for="(item, index) in currentMeta.evidence" :key="item"><i>{{ String(index + 1).padStart(2, '0') }}</i>{{ item }}</li></ol></article>
        <article class="capability-plan">
          <span class="capability-detail-label">发展计划</span><dl><div><dt>先修要求</dt><dd>{{ currentMeta.prerequisite }}</dd></div><div><dt>预计投入</dt><dd>{{ currentMeta.duration }}</dd></div><div><dt>关联训练</dt><dd>{{ currentMeta.challengeCount }} 项练习任务</dd></div></dl>
          <div class="capability-detail-actions"><RouterLink :to="learningRoute">查看学习资源</RouterLink><RouterLink to="/challenges">进入训练任务</RouterLink></div>
        </article>
      </div>
    </section>
  </main>
  <section v-else-if="loading" class="capability-state"><i></i><b>正在同步能力数据</b><span>请稍候</span></section>
  <section v-else class="capability-state is-error"><b>能力数据加载失败</b><span>{{ error }}</span><button type="button" @click="load">重新加载</button></section>
</template>
