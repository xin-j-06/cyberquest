<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const compactOpen = ref(false)
const title = computed(() => String(route.meta.adminTitle || '管理概览'))
const description = computed(() => String(route.meta.adminDescription || '管理平台运行状态与内容。'))
const initial = computed(() => auth.user?.username?.slice(0, 1) || '管')

const navItems = [
  { to: '/admin/overview', icon: '⌁', label: '管理概览', hint: '平台运行摘要' },
  { to: '/admin/challenges', icon: '▤', label: '题目管理', hint: '内容、靶场与运维' },
  { to: '/admin/tools', icon: '⌘', label: '工具管理', hint: '路径、安装与官网' },
  { to: '/admin/competitions', icon: '◈', label: '赛事管理', hint: '发布与维护赛事' },
  { to: '/admin/users', icon: '◎', label: '用户管理', hint: '账号与权限' },
  { to: '/admin/announcements', icon: '◇', label: '通知公告', hint: '发布平台消息' },
  { to: '/admin/feedback', icon: '✦', label: '意见反馈', hint: '错误报告与建议' },
]

async function logout() {
  await auth.logout()
  await router.replace('/admin/login')
}

</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" :class="{ open: compactOpen }">
      <RouterLink class="admin-brand" to="/admin/overview" @click="compactOpen=false">
        <i></i><span><b>赛博演武场</b><small>ADMIN CONSOLE</small></span>
      </RouterLink>
      <div class="admin-nav-label">工作区</div>
      <nav class="admin-nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" @click="compactOpen=false">
          <i>{{ item.icon }}</i><span><b>{{ item.label }}</b><small>{{ item.hint }}</small></span><em>›</em>
        </RouterLink>
      </nav>
      <div class="admin-side-spacer"></div>
      <div class="admin-identity">
        <i>{{ initial }}</i><div><b>{{ auth.user?.username }}</b><small>超级管理员</small></div>
        <button title="退出登录" @click="logout">↪</button>
      </div>
    </aside>
    <section class="admin-stage">
      <div class="admin-topbar">
        <button class="admin-menu-button" aria-label="打开管理菜单" @click="compactOpen=!compactOpen">☰</button>
        <div><span>ADMINISTRATION</span><h1>{{ title }}</h1><p>{{ description }}</p></div>
        <div class="admin-top-actions"><span class="admin-live"><i></i>服务正常</span></div>
      </div>
      <div class="admin-page"><RouterView /></div>
    </section>
    <button v-if="compactOpen" class="admin-backdrop" aria-label="关闭管理菜单" @click="compactOpen=false"></button>
  </div>
</template>
