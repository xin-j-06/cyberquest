<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import { useAuth } from './stores/auth'
import type { AdminUserRecord, Role } from '@cyberquest/shared'

const auth = useAuth()
const users = ref<AdminUserRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const query = ref('')
const roleFilter = ref<'ALL' | Role>('ALL')
const modal = ref<'create' | 'edit' | ''>('')
const deleting = ref<AdminUserRecord>()
const error = ref('')
const notice = ref('')
const form = reactive({ id: '', username: '', email: '', password: '', role: 'USER' as Role })

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return users.value.filter(user => (roleFilter.value === 'ALL' || user.role === roleFilter.value) && (!keyword || `${user.username} ${user.email}`.toLowerCase().includes(keyword)))
})
const learnerCount = computed(() => users.value.filter(user => user.role === 'USER').length)
const administratorCount = computed(() => users.value.filter(user => user.role === 'ADMIN').length)
const recentLoginCount = computed(() => users.value.filter(user => user.lastLoginAt && Date.now() - new Date(user.lastLoginAt).getTime() < 7 * 24 * 60 * 60 * 1000).length)
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '从未登录'

async function load() {
  loading.value = true; error.value = ''
  try { users.value = await apiCollection<AdminUserRecord>('/admin/users') }
  catch (reason: any) { error.value = reason.message || '账号列表加载失败。' }
  finally { loading.value = false }
}
function openCreate() {
  Object.assign(form, { id: '', username: '', email: '', password: '', role: 'USER' }); modal.value = 'create'; error.value = ''
}
function openEdit(user: AdminUserRecord) {
  Object.assign(form, { id: user.id, username: user.username, email: user.email, password: '', role: user.role }); modal.value = 'edit'; error.value = ''
}
async function save() {
  saving.value = true; error.value = ''
  try {
    if (modal.value === 'create') {
      await api('/admin/users', { method: 'POST', body: JSON.stringify({ username: form.username, email: form.email, password: form.password, role: form.role }) })
      notice.value = `账号“${form.username}”已创建。`
    } else {
      await api(`/admin/users/${form.id}`, { method: 'PATCH', body: JSON.stringify({ username: form.username, email: form.email, role: form.role }) })
      notice.value = `账号“${form.username}”已更新。`
    }
    modal.value = ''; await load()
  } catch (reason: any) { error.value = reason.message || '账号保存失败。' }
  finally { saving.value = false }
}
async function remove() {
  if (!deleting.value) return
  saving.value = true; error.value = ''
  try {
    const name = deleting.value.username
    await api(`/admin/users/${deleting.value.id}`, { method: 'DELETE' })
    deleting.value = undefined; notice.value = `账号“${name}”及其训练数据已删除。`; await load()
  } catch (reason: any) { error.value = reason.message || '账号删除失败。' }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <div class="admin-management-page">
    <section class="admin-list-summary">
      <article><i class="indigo">◎</i><div><small>账号总数</small><b>{{ users.length }}</b></div><span>全部平台注册身份</span></article>
      <article><i class="emerald">学</i><div><small>学员账号</small><b>{{ learnerCount }}</b></div><span>可参与学习与靶场</span></article>
      <article><i class="violet">管</i><div><small>管理员</small><b>{{ administratorCount }}</b></div><span>拥有后台管理权限</span></article>
      <article><i class="amber">↻</i><div><small>近 7 日登录</small><b>{{ recentLoginCount }}</b></div><span>近期活跃账号</span></article>
    </section>
    <section class="admin-panel admin-data-panel">
    <div class="admin-data-head">
      <div><span>ACCOUNT DIRECTORY</span><h2>平台账号</h2><p>集中管理学员身份和后台权限，敏感凭据不会在此展示。</p></div>
      <button class="admin-primary" @click="openCreate">＋ 新建账号</button>
    </div>
    <div v-if="notice" class="admin-toast success"><span>✓</span>{{ notice }}<button @click="notice=''">×</button></div>
    <div v-if="error && !modal && !deleting" class="admin-alert">{{ error }}</div>
    <div class="admin-toolbar">
      <label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索昵称或邮箱"></label>
      <div class="admin-segments"><button :class="{ active: roleFilter==='ALL' }" @click="roleFilter='ALL'">全部 {{ users.length }}</button><button :class="{ active: roleFilter==='USER' }" @click="roleFilter='USER'">学员 {{ users.filter(u=>u.role==='USER').length }}</button><button :class="{ active: roleFilter==='ADMIN' }" @click="roleFilter='ADMIN'">管理员 {{ users.filter(u=>u.role==='ADMIN').length }}</button></div>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>账号</th><th>角色</th><th>成长数据</th><th>注册时间</th><th>最近登录</th><th></th></tr></thead>
        <tbody>
          <tr v-for="user in filtered" :key="user.id">
            <td><div class="admin-user-cell"><i>{{ user.username.slice(0,1) }}</i><span><b>{{ user.username }} <em v-if="user.id===auth.user?.id">当前账号</em></b><small>{{ user.email }}</small></span></div></td>
            <td><span :class="['admin-role', user.role.toLowerCase()]">{{ user.role==='ADMIN'?'管理员':'学员' }}</span></td>
            <td><b class="admin-number">{{ user.score }}</b><small class="admin-table-note">积分 · Lv.{{ user.level }}</small></td>
            <td><time>{{ formatDate(user.createdAt) }}</time></td><td><time>{{ formatDate(user.lastLoginAt) }}</time></td>
            <td><div class="admin-row-actions"><button @click="openEdit(user)"><span>✎</span> 编辑</button><button class="danger" :disabled="user.id===auth.user?.id" @click="deleting=user"><span>×</span> 删除</button></div></td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="admin-empty">正在读取账号数据…</div>
      <div v-else-if="!filtered.length" class="admin-empty">没有符合当前条件的账号。</div>
    </div>
    <div class="admin-table-footer">显示 {{ filtered.length }} / {{ users.length }} 个账号 <button @click="load">↻ 刷新数据</button></div>
    </section>
  </div>

  <div v-if="modal" class="admin-modal-layer" @mousedown.self="modal=''">
    <form class="admin-modal" @submit.prevent="save">
      <div class="admin-modal-head"><div><span>{{ modal==='create'?'CREATE ACCOUNT':'EDIT ACCOUNT' }}</span><h2>{{ modal==='create'?'新建平台账号':'编辑账号资料' }}</h2></div><button type="button" @click="modal=''">×</button></div>
      <p>账号将保存在后端数据源中，并立即纳入管理员管理范围。</p>
      <label>昵称<input v-model.trim="form.username" required minlength="2" maxlength="80" placeholder="输入显示昵称"></label>
      <label>邮箱<input v-model.trim="form.email" required type="email" maxlength="254" placeholder="name@example.com"></label>
      <label v-if="modal==='create'">初始密码<input v-model="form.password" required type="password" minlength="8" maxlength="128" placeholder="至少 8 位字符"><small>创建后请通过安全渠道告知账号持有人。</small></label>
      <label>账号角色<select v-model="form.role"><option value="USER">学员 — 使用训练与学习功能</option><option value="ADMIN">管理员 — 可进入后台管理中心</option></select></label>
      <div v-if="error" class="admin-alert">{{ error }}</div>
      <div class="admin-modal-actions"><button type="button" @click="modal=''">取消</button><button class="admin-primary" :disabled="saving">{{ saving?'正在保存…':'保存账号' }}</button></div>
    </form>
  </div>
  <div v-if="deleting" class="admin-modal-layer" @mousedown.self="deleting=undefined">
    <div class="admin-modal admin-confirm"><i>!</i><h2>确认删除账号？</h2><p>“{{ deleting.username }}”的答题记录、靶场会话和笔记等关联数据也会被删除，此操作无法撤销。</p><div v-if="error" class="admin-alert">{{ error }}</div><div class="admin-modal-actions"><button @click="deleting=undefined">取消</button><button class="admin-danger" :disabled="saving" @click="remove">{{ saving?'正在删除…':'确认删除' }}</button></div></div>
  </div>
</template>
