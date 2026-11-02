<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './stores/auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const password = ref('')
const visible = ref(false)
const submitting = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.adminLogin(password.value)
    const requested = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    await router.replace(requested.startsWith('/admin/') && requested !== '/admin/login' ? requested : '/admin/overview')
  } catch (reason: any) {
    password.value = ''
    error.value = reason?.message || '管理员密码错误，请重新输入。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="admin-login-page">
    <aside class="admin-login-brand">
      <div class="admin-login-logo"><i></i><span><b>赛博演武场</b><small>ADMIN CONSOLE</small></span></div>
      <div class="admin-login-statement">
        <span>CYBERQUEST / ADMINISTRATION</span>
        <h1>专注管理，<br>保持平台有序运行。</h1>
        <p>账号、题目、赛事、公告与反馈集中在一个受控工作区内。</p>
      </div>
      <small class="admin-login-version">CYBERQUEST CONSOLE · SECURE ACCESS</small>
    </aside>

    <div class="admin-login-main">
      <form class="admin-login-card" @submit.prevent="submit">
        <div class="admin-login-badge">管</div>
        <span class="admin-login-eyebrow">ADMINISTRATOR ACCESS</span>
        <h2>进入管理控制台</h2>
        <p>请输入管理员密码完成身份验证。</p>
        <label>
          <span>管理员密码</span>
          <div class="admin-password-field">
            <input v-model="password" :type="visible?'text':'password'" autocomplete="current-password" minlength="8" maxlength="128" required autofocus placeholder="输入管理员密码">
            <button type="button" :aria-label="visible?'隐藏密码':'显示密码'" :title="visible?'隐藏密码':'显示密码'" @click="visible=!visible">{{ visible?'隐藏':'显示' }}</button>
          </div>
        </label>
        <div v-if="error" class="admin-login-error" role="alert"><i>!</i><span>{{ error }}</span></div>
        <button class="admin-login-submit" type="submit" :disabled="submitting||password.length<8">
          <span>{{ submitting?'正在验证…':'验证并进入' }}</span><i aria-hidden="true">→</i>
        </button>
        <small class="admin-login-security"><i></i>受限管理入口 · 登录失败将触发频率限制</small>
      </form>
    </div>
  </section>
</template>
