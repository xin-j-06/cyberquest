<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, apiCollection } from './api'
import type { AdminUserRecord, Announcement, ChallengeSummary } from '@cyberquest/shared'

const users = ref<AdminUserRecord[]>([])
const announcements = ref<Announcement[]>([])
const challenges = ref<ChallengeSummary[]>([])
const loading = ref(true)
const error = ref('')
const updatedAt = ref('')
const adminCount = computed(() => users.value.filter(user => user.role === 'ADMIN').length)
const publishedCount = computed(() => announcements.value.filter(item => item.published).length)
const totalSolves = computed(() => challenges.value.reduce((sum, item) => sum + (item.solves || 0), 0))
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '从未登录'

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [userRows, announcementRows, challengeRows] = await Promise.all([
      apiCollection<AdminUserRecord>('/admin/users'),
      apiCollection<Announcement>('/admin/announcements'),
      api<ChallengeSummary[]>('/challenges'),
    ])
    users.value = userRows
    announcements.value = announcementRows
    challenges.value = challengeRows
    updatedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())
  } catch (reason: any) { error.value = reason.message || '管理数据加载失败。' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="admin-overview">
    <div v-if="error" class="admin-alert">{{ error }}</div>
    <section class="admin-overview-banner">
      <div class="admin-banner-mark"><span></span><i>✓</i></div>
      <div><span>PLATFORM STATUS</span><h2>平台运行正常</h2><p>账号、训练题目和通知服务均已连接，管理权限保护正在生效。</p></div>
      <div class="admin-sync"><small>最后同步</small><b>{{ updatedAt || '--:--' }}</b><button :disabled="loading" @click="load">{{ loading ? '同步中…' : '刷新数据' }}</button></div>
    </section>
    <section class="admin-stat-grid" :class="{ loading }">
      <article class="indigo"><div><span>平台注册账号</span><i>◎</i></div><b>{{ users.length }}</b><p>{{ adminCount }} 位管理员 · {{ users.length-adminCount }} 位学员</p></article>
      <article class="emerald"><div><span>开放 CTF 题目</span><i>⌁</i></div><b>{{ challenges.length }}</b><p>全部题目均可进入独立靶场</p></article>
      <article class="violet"><div><span>累计有效解题</span><i>✓</i></div><b>{{ totalSolves }}</b><p>由后端提交记录实时汇总</p></article>
      <article class="amber"><div><span>已发布公告</span><i>◇</i></div><b>{{ publishedCount }}</b><p>{{ announcements.length - publishedCount }} 篇草稿待处理</p></article>
    </section>
    <section class="admin-overview-grid">
      <article class="admin-panel admin-recent-users">
        <div class="admin-panel-head"><div><span>RECENT ACCOUNTS</span><h2>最近注册</h2></div><RouterLink to="/admin/users">管理全部 →</RouterLink></div>
        <div class="admin-mini-table">
          <div v-for="user in users.slice(0, 6)" :key="user.id" class="admin-mini-row">
            <i>{{ user.username.slice(0,1) }}</i><div><b>{{ user.username }}</b><small>{{ user.email }}</small></div>
            <span :class="['admin-role', user.role.toLowerCase()]">{{ user.role === 'ADMIN' ? '管理员' : '学员' }}</span>
            <time>{{ formatDate(user.createdAt) }}</time>
          </div>
          <div v-if="!loading && !users.length" class="admin-empty">暂无注册账号</div>
        </div>
      </article>
      <article class="admin-panel admin-notice-preview">
        <div class="admin-panel-head"><div><span>ANNOUNCEMENTS</span><h2>最新公告</h2></div><RouterLink to="/admin/announcements">发布公告 →</RouterLink></div>
        <div v-for="item in announcements.slice(0, 3)" :key="item.id" class="admin-notice-row">
          <div><i :class="{ draft: !item.published }"></i><b>{{ item.title }}</b></div>
          <p>{{ item.content }}</p><small>{{ item.author }} · {{ formatDate(item.updatedAt) }}</small>
        </div>
        <div v-if="!loading && !announcements.length" class="admin-empty">暂无公告，创建第一条平台通知。</div>
      </article>
    </section>
    <section class="admin-panel admin-shortcuts">
      <div class="admin-panel-head"><div><span>QUICK ACTIONS</span><h2>快捷操作</h2></div></div>
      <div><RouterLink to="/admin/users"><i>＋</i><span><b>创建平台账号</b><small>新增学员或管理员账号</small></span><em>→</em></RouterLink><RouterLink to="/admin/announcements"><i>◇</i><span><b>发布通知公告</b><small>向学员端推送平台信息</small></span><em>→</em></RouterLink><RouterLink to="/admin/challenges"><i>↗</i><span><b>检查题目配置</b><small>在后台诊断挑战与靶场状态</small></span><em>→</em></RouterLink></div>
    </section>
  </div>
</template>
