<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'
import { realtimeState } from './realtime'
import FeedbackWidget from './FeedbackWidget.vue'
const auth = useAuth()
const route = useRoute()
const router = useRouter()
const accountOpen = ref(false)
const theme = ref<'light' | 'dark'>(localStorage.getItem('cq_theme') === 'dark' ? 'dark' : 'light')
const headerCollapsed = ref(localStorage.getItem('cq_header_collapsed') === 'true')
const isolatedTarget = computed(() => route.path.startsWith('/targets/') || route.path.startsWith('/sandbox/'))
const adminRoute = computed(() => route.path.startsWith('/admin'))
const agentRoute = computed(() => route.path === '/agent')
const isolatedPage = computed(() => isolatedTarget.value || adminRoute.value)
const accountInitial = computed(() => auth.user?.username?.trim().slice(0, 1) || '学')
function closeAccount(){ accountOpen.value = false }
function toggleHeader(){
  headerCollapsed.value = !headerCollapsed.value
  localStorage.setItem('cq_header_collapsed', String(headerCollapsed.value))
  closeAccount()
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}
function toggleTheme(){
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem('cq_theme', theme.value)
  closeAccount()
}
async function logout(){ closeAccount(); await auth.logout(); await router.replace('/') }
function handleOutside(event: MouseEvent){
  if (!(event.target as HTMLElement)?.closest('.account-control')) closeAccount()
}
function handleKeyboard(event: KeyboardEvent){ if (event.key === 'Escape') closeAccount() }
watch(() => auth.user?.id, (userId, previousUserId) => {
  closeAccount()
  if (userId && !previousUserId) {
    headerCollapsed.value = false
    localStorage.setItem('cq_header_collapsed', 'false')
  }
})
onMounted(()=>{ document.addEventListener('click',handleOutside); document.addEventListener('keydown',handleKeyboard) })
onUnmounted(()=>{ document.removeEventListener('click',handleOutside); document.removeEventListener('keydown',handleKeyboard) })
</script>

<template>
  <header v-if="!isolatedPage" :class="['site-header',{ 'is-collapsed': !auth.user || headerCollapsed }]">
    <RouterLink class="brand" to="/"><i></i>赛博<span>演武场</span><small>安全实战学习平台</small></RouterLink>
    <nav v-if="auth.user">
      <RouterLink to="/challenges">靶场挑战</RouterLink><RouterLink to="/agent">AI 智能体</RouterLink><RouterLink to="/tools">常用工具</RouterLink>
      <RouterLink to="/skills">能力中心</RouterLink><RouterLink to="/learning">学习中心</RouterLink>
      <RouterLink to="/competitions">相关赛事</RouterLink><RouterLink to="/forum">技术论坛</RouterLink><RouterLink to="/leaderboard">英雄榜</RouterLink>
    </nav>
    <div class="top-status"><b></b>系统运行中</div>
    <span v-if="realtimeState.connected" class="top-status">实时已连接</span>
    <RouterLink v-if="!auth.user" class="login" to="/login">登录平台</RouterLink>
    <div v-else class="account-control">
      <button class="account-trigger" :class="{ active: accountOpen }" aria-haspopup="menu" :aria-expanded="accountOpen" @click.stop="accountOpen=!accountOpen">
        <i>{{ accountInitial }}</i><span>{{ auth.user.username }}</span><b>⌄</b>
      </button>
      <div v-if="accountOpen" class="account-dropdown" role="menu" @click.stop>
        <RouterLink v-if="auth.user.role==='ADMIN'" role="menuitem" to="/admin/overview" @click="closeAccount"><i>⌁</i><span><b>后台管理中心</b><small>账号、权限与通知公告</small></span><em>→</em></RouterLink>
        <RouterLink role="menuitem" to="/profile" @click="closeAccount"><i>◎</i><span><b>个人中心</b><small>档案、能力与题目笔记</small></span><em>→</em></RouterLink>
        <button role="menuitem" @click="toggleTheme"><i>{{ theme === 'dark' ? '☀' : '◐' }}</i><span><b>{{ theme === 'dark' ? '切换浅色模式' : '切换深色模式' }}</b><small>当前为{{ theme === 'dark' ? '深色' : '浅色' }}主题</small></span></button>
        <button class="account-logout" role="menuitem" @click="logout"><i>↪</i><span><b>退出登录</b><small>结束当前浏览器会话</small></span></button>
      </div>
    </div>
    <button v-if="auth.user" type="button" class="site-header-toggle" :aria-label="headerCollapsed ? '展开顶部导航' : '收起顶部导航'" :title="headerCollapsed ? '展开顶部导航' : '收起顶部导航'" :aria-expanded="!headerCollapsed" @click="toggleHeader">
      <svg viewBox="0 0 24 14" aria-hidden="true"><path d="m5 10 7-6 7 6"/></svg>
    </button>
  </header>
  <main :class="{ 'sandbox-main': isolatedTarget, 'admin-main': adminRoute, 'agent-main': agentRoute }"><RouterView /></main>
  <FeedbackWidget v-if="auth.user && !isolatedPage && route.path !== '/login'" />
</template>
