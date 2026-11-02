<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import type { FeedbackRecord, FeedbackStatus, FeedbackType } from '@cyberquest/shared'

const rows = ref<FeedbackRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const query = ref('')
const status = ref<'ALL'|FeedbackStatus>('ALL')
const type = ref<'ALL'|FeedbackType>('ALL')
const selected = ref<FeedbackRecord>()
const notice = ref('')
const error = ref('')
const form = reactive({status:'NEW' as FeedbackStatus,adminNote:''})
const filtered = computed(()=>rows.value.filter(item=>(status.value==='ALL'||item.status===status.value)&&(type.value==='ALL'||item.type===type.value)&&(!query.value.trim()||`${item.title} ${item.content} ${item.username} ${item.email}`.toLowerCase().includes(query.value.trim().toLowerCase()))))
const count = (value:FeedbackStatus)=>rows.value.filter(item=>item.status===value).length
const formatDate = (value:string)=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
const statusName = (value:FeedbackStatus)=>({NEW:'待处理',IN_PROGRESS:'处理中',RESOLVED:'已解决'}[value])
function open(item:FeedbackRecord){selected.value=item;Object.assign(form,{status:item.status,adminNote:item.adminNote||''});error.value=''}
async function load(){loading.value=true;error.value='';try{rows.value=await apiCollection<FeedbackRecord>('/admin/feedback')}catch(reason:any){error.value=reason.message||'反馈列表加载失败。'}finally{loading.value=false}}
async function save(){if(!selected.value)return;saving.value=true;error.value='';try{await api(`/admin/feedback/${selected.value.id}`,{method:'PATCH',body:JSON.stringify(form)});notice.value=`反馈“${selected.value.title}”已更新为${statusName(form.status)}。`;selected.value=undefined;await load()}catch(reason:any){error.value=reason.message||'反馈处理状态保存失败。'}finally{saving.value=false}}
onMounted(load)
</script>

<template>
  <div class="admin-management-page admin-feedback-page">
    <section class="admin-list-summary feedback-summary">
      <article><i class="indigo">◇</i><div><small>全部反馈</small><b>{{rows.length}}</b></div><span>错误与优化建议</span></article>
      <article><i class="amber">!</i><div><small>等待处理</small><b>{{count('NEW')}}</b></div><span>尚未开始跟进</span></article>
      <article><i class="violet">↻</i><div><small>正在处理</small><b>{{count('IN_PROGRESS')}}</b></div><span>管理员跟进中</span></article>
      <article><i class="emerald">✓</i><div><small>已经解决</small><b>{{count('RESOLVED')}}</b></div><span>处理闭环完成</span></article>
    </section>
    <section class="admin-panel admin-data-panel">
      <div class="admin-data-head"><div><span>FEEDBACK INBOX</span><h2>意见反馈</h2><p>集中接收学员报告的系统错误和产品优化建议。</p></div><button @click="load">↻ 刷新反馈</button></div>
      <div v-if="notice" class="admin-toast success"><span>✓</span>{{notice}}<button @click="notice=''">×</button></div>
      <div v-if="error&&!selected" class="admin-alert">{{error}}</div>
      <div class="admin-toolbar admin-feedback-toolbar"><label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索标题、内容或提交学员"></label><div class="admin-feedback-filters"><select v-model="type"><option value="ALL">全部类型</option><option value="BUG">系统错误</option><option value="SUGGESTION">优化建议</option></select><select v-model="status"><option value="ALL">全部状态</option><option value="NEW">待处理</option><option value="IN_PROGRESS">处理中</option><option value="RESOLVED">已解决</option></select></div></div>
      <div class="admin-feedback-list">
        <article v-for="item in filtered" :key="item.id" @click="open(item)">
          <i :class="item.type.toLowerCase()">{{item.type==='BUG'?'!':'✦'}}</i>
          <div class="admin-feedback-copy"><div><span :class="['admin-feedback-type',item.type.toLowerCase()]">{{item.type==='BUG'?'系统错误':'优化建议'}}</span><span :class="['admin-feedback-status',item.status.toLowerCase()]">{{statusName(item.status)}}</span></div><h3>{{item.title}}</h3><p>{{item.content}}</p><small>{{item.username}} · {{item.email}} · {{formatDate(item.createdAt)}}</small></div>
          <div class="admin-feedback-page-ref"><small>来源页面</small><code>{{item.pageUrl||'未记录'}}</code></div><button @click.stop="open(item)">查看处理 <span>→</span></button>
        </article>
        <div v-if="loading" class="admin-empty">正在读取反馈数据…</div><div v-else-if="!filtered.length" class="admin-empty">当前筛选条件下没有反馈记录。</div>
      </div>
    </section>
  </div>
  <div v-if="selected" class="admin-modal-layer" @mousedown.self="selected=undefined"><form class="admin-modal admin-feedback-modal" @submit.prevent="save"><div class="admin-modal-head"><div><span>FEEDBACK DETAIL</span><h2>{{selected.title}}</h2></div><button type="button" @click="selected=undefined">×</button></div><div class="admin-feedback-meta"><span :class="['admin-feedback-type',selected.type.toLowerCase()]">{{selected.type==='BUG'?'系统错误':'优化建议'}}</span><b>{{selected.username}}</b><small>{{selected.email}} · {{formatDate(selected.createdAt)}}</small></div><div class="admin-feedback-detail"><p>{{selected.content}}</p><div><span>来源页面</span><code>{{selected.pageUrl||'未记录'}}</code></div></div><label>处理状态<select v-model="form.status"><option value="NEW">待处理</option><option value="IN_PROGRESS">处理中</option><option value="RESOLVED">已解决</option></select></label><label>管理员处理备注<textarea v-model.trim="form.adminNote" maxlength="5000" rows="6" placeholder="记录定位结果、处理方案或版本计划…"></textarea><small>{{form.adminNote.length}} / 5000</small></label><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button type="button" @click="selected=undefined">取消</button><button class="admin-primary" :disabled="saving">{{saving?'正在保存…':'保存处理结果'}}</button></div></form></div>
</template>
