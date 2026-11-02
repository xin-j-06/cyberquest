<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'
import type { AuthUser } from '@cyberquest/shared'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const failed = ref(false)

onMounted(() => {
  const handoffId = typeof route.query.handoff === 'string' ? route.query.handoff : ''
  if (!/^[0-9a-f-]{36}$/i.test(handoffId)) { failed.value = true; return }
  const storageKey = `cq_admin_test_handoff:${handoffId}`
  const serialized = localStorage.getItem(storageKey)
  localStorage.removeItem(storageKey)
  if (!serialized) { failed.value = true; return }
  try {
    const payload = JSON.parse(serialized) as { accessToken?: string; user?: AuthUser; expiresAt?: number }
    if (!payload.accessToken || payload.user?.role !== 'ADMIN' || !payload.expiresAt || payload.expiresAt < Date.now()) {
      failed.value = true
      return
    }
    auth.save({ accessToken: payload.accessToken, user: payload.user })
    void router.replace('/')
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <section class="admin-handoff-page">
    <div class="admin-handoff-card">
      <i :class="{ failed }">{{ failed?'!':'↗' }}</i>
      <h1>{{ failed?'会话接力已失效':'正在打开管理员测试端' }}</h1>
      <p>{{ failed?'请返回管理后台并重新点击顶部入口。':'正在安全继承当前管理员会话，无需再次输入密码。' }}</p>
      <a v-if="failed" href="/admin/login">返回管理端</a>
      <span v-else><b></b><b></b><b></b></span>
    </div>
  </section>
</template>
