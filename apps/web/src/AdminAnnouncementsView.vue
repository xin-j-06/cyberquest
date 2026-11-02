<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import type { Announcement } from '@cyberquest/shared'

const rows = ref<Announcement[]>([])
const loading = ref(true)
const saving = ref(false)
const query = ref('')
const filter = ref<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL')
const modal = ref(false)
const deleting = ref<Announcement>()
const notice = ref('')
const error = ref('')
const form = reactive({ id: '', title: '', content: '', published: true })
const filtered = computed(() => rows.value.filter(item => (filter.value === 'ALL' || (filter.value === 'PUBLISHED' ? item.published : !item.published)) && (!query.value.trim() || `${item.title} ${item.content}`.toLowerCase().includes(query.value.trim().toLowerCase()))))
const publishedCount = computed(() => rows.value.filter(item => item.published).length)
const draftCount = computed(() => rows.value.filter(item => !item.published).length)
const latestUpdate = computed(() => rows.value.length ? rows.value.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, rows.value[0].updatedAt) : '')
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

async function load() { loading.value = true; error.value = ''; try { rows.value = await apiCollection<Announcement>('/admin/announcements') } catch (reason:any) { error.value = reason.message || '公告列表加载失败。' } finally { loading.value = false } }
function create() { Object.assign(form, { id:'', title:'', content:'', published:true }); modal.value = true; error.value = '' }
function edit(item: Announcement) { Object.assign(form, { id:item.id, title:item.title, content:item.content, published:item.published }); modal.value = true; error.value = '' }
async function save() {
  saving.value = true; error.value = ''
  try { const options = { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify({ title:form.title, content:form.content, published:form.published }) }; await api(form.id ? `/admin/announcements/${form.id}` : '/admin/announcements', options); notice.value = form.published ? '公告已保存并向学员端发布。' : '公告草稿已保存。'; modal.value = false; await load() }
  catch (reason:any) { error.value = reason.message || '公告保存失败。' } finally { saving.value = false }
}
async function toggle(item: Announcement) { error.value=''; try { await api(`/admin/announcements/${item.id}`, { method:'PATCH', body:JSON.stringify({ published:!item.published }) }); notice.value = item.published ? '公告已撤回并转为草稿。' : '公告已发布。'; await load() } catch(reason:any) { error.value=reason.message } }
async function remove() { if(!deleting.value) return; saving.value=true; error.value=''; try { const title=deleting.value.title; await api(`/admin/announcements/${deleting.value.id}`, {method:'DELETE'}); deleting.value=undefined; notice.value=`公告“${title}”已删除。`; await load() } catch(reason:any){ error.value=reason.message } finally { saving.value=false } }
onMounted(load)
</script>

<template>
  <div class="admin-management-page">
    <section class="admin-list-summary notice-summary">
      <article><i class="indigo">◇</i><div><small>全部公告</small><b>{{ rows.length }}</b></div><span>包含已发布与草稿</span></article>
      <article><i class="emerald">✓</i><div><small>正在发布</small><b>{{ publishedCount }}</b></div><span>学员首页当前可见</span></article>
      <article><i class="amber">≡</i><div><small>待发布草稿</small><b>{{ draftCount }}</b></div><span>仅管理员可查看</span></article>
      <article class="summary-date"><i class="violet">↻</i><div><small>最近更新</small><b>{{ latestUpdate ? formatDate(latestUpdate).split(' ')[0] : '暂无' }}</b></div><span>{{ latestUpdate ? formatDate(latestUpdate).split(' ')[1] : '尚无公告记录' }}</span></article>
    </section>
    <section class="admin-panel admin-data-panel">
    <div class="admin-data-head"><div><span>NOTICE CENTER</span><h2>通知公告</h2><p>创建、发布和维护学员首页接收的平台消息。</p></div><button class="admin-primary" @click="create">＋ 发布公告</button></div>
    <div v-if="notice" class="admin-toast success"><span>✓</span>{{ notice }}<button @click="notice=''">×</button></div>
    <div v-if="error && !modal && !deleting" class="admin-alert">{{ error }}</div>
    <div class="admin-toolbar"><label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索公告标题或正文"></label><div class="admin-segments"><button :class="{active:filter==='ALL'}" @click="filter='ALL'">全部 {{rows.length}}</button><button :class="{active:filter==='PUBLISHED'}" @click="filter='PUBLISHED'">已发布 {{rows.filter(r=>r.published).length}}</button><button :class="{active:filter==='DRAFT'}" @click="filter='DRAFT'">草稿 {{rows.filter(r=>!r.published).length}}</button></div></div>
    <div class="admin-notice-list">
      <article v-for="item in filtered" :key="item.id">
        <div class="admin-notice-index">{{ String(rows.indexOf(item)+1).padStart(2,'0') }}</div>
        <div class="admin-notice-body"><div><span :class="['admin-status', item.published?'published':'draft']">{{item.published?'已发布':'草稿'}}</span><time>更新于 {{formatDate(item.updatedAt)}}</time></div><h3>{{item.title}}</h3><p>{{item.content}}</p><small>由 {{item.author}} 发布 · 创建于 {{formatDate(item.createdAt)}}</small></div>
        <div class="admin-notice-actions"><button @click="toggle(item)">{{item.published?'撤回':'发布'}}</button><button @click="edit(item)">编辑</button><button class="danger" @click="deleting=item">删除</button></div>
      </article>
      <div v-if="loading" class="admin-empty">正在读取公告数据…</div><div v-else-if="!filtered.length" class="admin-empty">没有符合当前条件的公告。</div>
    </div>
    </section>
  </div>
  <div v-if="modal" class="admin-modal-layer" @mousedown.self="modal=false"><form class="admin-modal admin-notice-modal" @submit.prevent="save"><div class="admin-modal-head"><div><span>{{form.id?'EDIT NOTICE':'NEW NOTICE'}}</span><h2>{{form.id?'编辑通知公告':'发布新公告'}}</h2></div><button type="button" @click="modal=false">×</button></div><p>发布后的内容会出现在学员首页“通知公告”板块。</p><label>公告标题<input v-model.trim="form.title" required minlength="2" maxlength="120" placeholder="用一句话说明公告主题"></label><label>公告正文<textarea v-model.trim="form.content" required minlength="2" maxlength="5000" rows="8" placeholder="填写清晰、完整的通知内容"></textarea><small>{{form.content.length}} / 5000</small></label><label class="admin-switch"><input v-model="form.published" type="checkbox"><i></i><span><b>立即发布</b><small>{{form.published?'保存后学员可立即看到':'暂存为草稿，仅管理员可见'}}</small></span></label><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button type="button" @click="modal=false">取消</button><button class="admin-primary" :disabled="saving">{{saving?'正在保存…':form.published?'保存并发布':'保存草稿'}}</button></div></form></div>
  <div v-if="deleting" class="admin-modal-layer" @mousedown.self="deleting=undefined"><div class="admin-modal admin-confirm"><i>!</i><h2>删除这条公告？</h2><p>“{{deleting.title}}”将从管理记录和学员端永久移除。</p><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button @click="deleting=undefined">取消</button><button class="admin-danger" :disabled="saving" @click="remove">{{saving?'正在删除…':'确认删除'}}</button></div></div></div>
</template>
