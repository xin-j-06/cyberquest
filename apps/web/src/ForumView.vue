<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { ForumCategory, ForumPostDetail, ForumPostSummary, ForumReply } from '@cyberquest/shared';
import { api } from './api';
import { useAuth } from './stores/auth';

const categoryMeta: Record<ForumCategory, { label: string; icon: string; tone: string; description: string }> = {
  QA: { label: '技术问答', icon: '?', tone: 'blue', description: '定位问题与复现故障' },
  WRITEUP: { label: '解题交流', icon: '</>', tone: 'violet', description: '分享思路与验证过程' },
  TOOLS: { label: '工具与环境', icon: '#', tone: 'green', description: '工具链和环境配置' },
  RESOURCES: { label: '资源分享', icon: '+', tone: 'orange', description: '资料、清单与学习路径' },
};
const categories = Object.entries(categoryMeta) as Array<[ForumCategory, (typeof categoryMeta)[ForumCategory]]>;
const posts = ref<ForumPostSummary[]>([]);
const selected = ref<ForumPostDetail>();
const activeCategory = ref<'ALL' | ForumCategory>('ALL');
const viewMode = ref<'LATEST' | 'POPULAR' | 'MINE'>('LATEST');
const search = ref('');
const loading = ref(true);
const detailLoading = ref(false);
const composerOpen = ref(false);
const submitting = ref(false);
const replying = ref(false);
const error = ref('');
const replyText = ref('');
const form = reactive<{ category: ForumCategory; title: string; content: string }>({ category: 'QA', title: '', content: '' });
const auth = useAuth();

const filteredPosts = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const result = posts.value.filter((post) => {
    if (activeCategory.value !== 'ALL' && post.category !== activeCategory.value) return false;
    if (viewMode.value === 'MINE' && post.authorId !== auth.user?.id) return false;
    return !keyword || `${post.title} ${post.excerpt} ${post.authorName}`.toLowerCase().includes(keyword);
  });
  if (viewMode.value === 'POPULAR') return [...result].sort((a, b) => (b.replyCount * 8 + b.views) - (a.replyCount * 8 + a.views));
  return result;
});
const replyTotal = computed(() => posts.value.reduce((sum, item) => sum + item.replyCount, 0));
function categoryCount(category: ForumCategory) { return posts.value.filter((post) => post.category === category).length; }

function displayDate(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60_000) return '刚刚';
  if (diff >= 0 && diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadPosts() {
  loading.value = true;
  error.value = '';
  try { posts.value = await api<ForumPostSummary[]>('/forum/posts'); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : '论坛加载失败'; }
  finally { loading.value = false; }
}

async function openPost(post: ForumPostSummary) {
  detailLoading.value = true;
  error.value = '';
  try {
    selected.value = await api<ForumPostDetail>(`/forum/posts/${post.id}`);
    const local = posts.value.find((item) => item.id === post.id);
    if (local) local.views = selected.value.views;
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '帖子加载失败'; }
  finally { detailLoading.value = false; }
}

function openComposer() {
  error.value = '';
  form.category = activeCategory.value === 'ALL' ? 'QA' : activeCategory.value;
  form.title = '';
  form.content = '';
  composerOpen.value = true;
}

async function createPost() {
  if (!form.title.trim() || !form.content.trim()) { error.value = '请填写标题和正文。'; return; }
  submitting.value = true;
  error.value = '';
  try {
    const created = await api<ForumPostDetail>('/forum/posts', { method: 'POST', body: JSON.stringify(form) });
    composerOpen.value = false;
    selected.value = created;
    await loadPosts();
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '发布失败'; }
  finally { submitting.value = false; }
}

async function createReply() {
  if (!selected.value || !replyText.value.trim()) return;
  replying.value = true;
  error.value = '';
  try {
    const created = await api<ForumReply>(`/forum/posts/${selected.value.id}/replies`, { method: 'POST', body: JSON.stringify({ content: replyText.value }) });
    selected.value.replies.push(created);
    selected.value.replyCount += 1;
    selected.value.updatedAt = created.createdAt;
    replyText.value = '';
    await loadPosts();
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '回复失败'; }
  finally { replying.value = false; }
}

async function deletePost() {
  if (!selected.value || !window.confirm('确认删除这条讨论及其全部回复吗？')) return;
  error.value = '';
  try {
    await api(`/forum/posts/${selected.value.id}`, { method: 'DELETE' });
    selected.value = undefined;
    await loadPosts();
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '删除失败'; }
}

onMounted(loadPosts);
</script>

<template>
  <main class="forum-page page">
    <header class="forum-main-header">
      <div><span class="forum-kicker">TECHNICAL FORUM</span><h1>技术论坛</h1><p>遇到问题时，请贴出运行环境、完整报错和已经尝试的方法；也可以分享你的解题记录和工具经验。</p></div>
      <button class="forum-primary" @click="openComposer">＋ 发布问题或经验</button>
    </header>

    <section class="forum-layout">
      <section class="forum-feed">
        <header class="forum-commandbar">
          <nav aria-label="主题排序"><button :class="{active:viewMode==='LATEST'}" @click="viewMode='LATEST'">全部帖子</button><button :class="{active:viewMode==='POPULAR'}" @click="viewMode='POPULAR'">热门讨论</button><button :class="{active:viewMode==='MINE'}" @click="viewMode='MINE'">我发布的</button></nav>
          <label class="forum-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="search" placeholder="搜索帖子标题或内容" /></label>
        </header>

        <nav class="forum-category-filter" aria-label="帖子分类">
          <button :class="{ active: activeCategory === 'ALL' }" @click="activeCategory='ALL'">全部 <b>{{ posts.length }}</b></button>
          <button v-for="[key, meta] in categories" :key="key" :class="{ active: activeCategory === key }" @click="activeCategory=key">{{ meta.label }} <b>{{ categoryCount(key) }}</b></button>
        </nav>

        <div v-if="error && !composerOpen && !selected" class="forum-alert">{{ error }} <button @click="error=''">×</button></div>
        <section class="forum-post-list">
          <header><div><h2>{{ viewMode === 'POPULAR' ? '热门讨论' : viewMode === 'MINE' ? '我发布的帖子' : '全部帖子' }}</h2><p>{{ filteredPosts.length }} 条结果</p></div><span>按最后回复时间排序</span></header>
          <div v-if="loading" class="forum-empty"><i class="forum-spinner"></i><b>正在加载帖子</b></div>
          <div v-else-if="!filteredPosts.length" class="forum-empty"><b>没有找到相关帖子</b><p>换一个关键词或分类试试，也可以直接发布新问题。</p><button class="forum-primary" @click="openComposer">发布新帖子</button></div>
          <button v-for="post in filteredPosts" v-else :key="post.id" class="forum-post-row" @click="openPost(post)">
            <span class="forum-post-votes"><b>{{ post.replyCount }}</b><small>回复</small><em>{{ post.views }} 浏览</em></span>
            <span class="forum-post-body">
              <span class="forum-post-labels"><em>{{ categoryMeta[post.category].label }}</em><em v-if="post.pinned" class="pinned">置顶</em></span>
              <b>{{ post.title }}</b><p>{{ post.excerpt }}</p>
              <small><i>{{ post.authorName.slice(0,1) }}</i>{{ post.authorName }} · 更新于 {{ displayDate(post.updatedAt) }}</small>
            </span>
            <span class="forum-post-open">查看讨论 <b>→</b></span>
          </button>
        </section>
      </section>

      <aside class="forum-help-sidebar">
        <section class="forum-ask-card"><span>没有找到答案？</span><h2>把问题描述清楚，更容易得到有效回复</h2><button class="forum-primary" @click="openComposer">发布一个问题</button></section>
        <section class="forum-checklist"><h3>发帖前请准备</h3><ol><li><i>1</i><span><b>运行环境</b><small>操作系统、软件名称与版本</small></span></li><li><i>2</i><span><b>完整现象</b><small>报错文本、日志或截图内容</small></span></li><li><i>3</i><span><b>复现步骤</b><small>从哪一步开始出现问题</small></span></li><li><i>4</i><span><b>已尝试方法</b><small>做过哪些排查，结果是什么</small></span></li></ol></section>
        <section class="forum-summary-card"><h3>论坛概况</h3><dl><div><dt>帖子</dt><dd>{{ posts.length }}</dd></div><div><dt>回复</dt><dd>{{ replyTotal }}</dd></div><div><dt>分类</dt><dd>{{ categories.length }}</dd></div></dl><p>请勿发布动态 Flag、真实凭据或个人敏感数据。</p></section>
      </aside>
    </section>

    <div v-if="composerOpen" class="forum-modal" @click.self="composerOpen=false">
      <form class="forum-dialog forum-compose" @submit.prevent="createPost">
        <header><div><span>NEW DISCUSSION</span><h2>发布技术讨论</h2></div><button type="button" @click="composerOpen=false">×</button></header>
        <label>讨论分类<select v-model="form.category"><option v-for="[key, meta] in categories" :key="key" :value="key">{{ meta.label }}</option></select></label>
        <label>主题标题<input v-model="form.title" maxlength="80" placeholder="用一句话准确描述问题或分享内容" /></label>
        <label>正文内容<textarea v-model="form.content" maxlength="5000" rows="10" placeholder="建议包含背景、已尝试步骤、关键输出与期望结果……"></textarea></label>
        <p v-if="error" class="forum-form-error">{{ error }}</p>
        <footer><small>{{ form.content.length }} / 5000</small><button type="button" @click="composerOpen=false">取消</button><button class="forum-primary" :disabled="submitting">{{ submitting ? '发布中…' : '发布讨论' }}</button></footer>
      </form>
    </div>

    <div v-if="selected || detailLoading" class="forum-modal" @click.self="selected=undefined">
      <article class="forum-dialog forum-detail">
        <div v-if="detailLoading" class="forum-empty"><i class="forum-spinner"></i><b>正在打开讨论</b></div>
        <template v-else-if="selected">
          <header><div><span>{{ categoryMeta[selected.category].label }}</span><h2>{{ selected.title }}</h2><p>{{ selected.authorName }} · {{ displayDate(selected.createdAt) }} · {{ selected.views }} 次浏览</p></div><div class="forum-dialog-actions"><button v-if="selected.authorId===auth.user?.id || auth.user?.role==='ADMIN'" class="danger" type="button" @click="deletePost">删除</button><button type="button" @click="selected=undefined">×</button></div></header>
          <section class="forum-original"><div class="forum-author-avatar">{{ selected.authorName.slice(0,1) }}</div><div><b>{{ selected.authorName }} <em v-if="selected.authorRole==='ADMIN'">管理员</em></b><small>楼主</small><p>{{ selected.content }}</p></div></section>
          <section class="forum-replies"><h3>全部回复 <span>{{ selected.replyCount }}</span></h3><div v-if="!selected.replies.length" class="forum-no-reply">还没有回复，来补充第一条有效信息。</div><article v-for="(reply, index) in selected.replies" :key="reply.id"><div class="forum-author-avatar secondary">{{ reply.authorName.slice(0,1) }}</div><div><header><p><b>{{ reply.authorName }}</b><em v-if="reply.authorRole==='ADMIN'">管理员</em><small>#{{ index + 1 }} · {{ displayDate(reply.createdAt) }}</small></p></header><div>{{ reply.content }}</div></div></article></section>
          <form class="forum-reply-box" @submit.prevent="createReply"><textarea v-model="replyText" maxlength="2000" rows="4" placeholder="写下可验证的补充、解决方案或排查建议……"></textarea><div><small>{{ replyText.length }} / 2000</small><button class="forum-primary" :disabled="replying || !replyText.trim()">{{ replying ? '回复中…' : '发表回复' }}</button></div></form>
          <p v-if="error" class="forum-form-error detail-error">{{ error }}</p>
        </template>
      </article>
    </div>
  </main>
</template>
