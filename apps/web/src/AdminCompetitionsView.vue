<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import type { Competition, CompetitionCategory, CompetitionInput } from '@cyberquest/shared'

const rows = ref<Competition[]>([])
const loading = ref(true), saving = ref(false), modal = ref(false)
const query = ref(''), filter = ref<'ALL'|'PUBLISHED'|'DRAFT'>('ALL'), error = ref(''), notice = ref('')
const deleting = ref<Competition>()
const form = reactive({ id:'', title:'', category:'DOMESTIC' as CompetitionCategory, operator:'', status:'报名中', scope:'', description:'', tags:'', url:'', startAt:'', endAt:'', registrationDeadline:'', published:true, featured:false })
const categoryLabel: Record<CompetitionCategory,string> = { INTERNATIONAL:'国际公开', DOMESTIC:'国内联赛', UNIVERSITY:'高校竞赛' }
const filtered = computed(() => rows.value.filter(item => (filter.value==='ALL'||(filter.value==='PUBLISHED'?item.published:!item.published)) && (!query.value.trim() || `${item.title} ${item.operator} ${item.description}`.toLowerCase().includes(query.value.trim().toLowerCase()))))
const publishedCount = computed(() => rows.value.filter(item=>item.published).length)
const draftCount = computed(() => rows.value.filter(item=>!item.published).length)
const featuredCount = computed(() => rows.value.filter(item=>item.featured).length)
const formatDate = (value?:string) => value ? new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '未设置'
const inputDate = (value?:string) => value ? new Date(value).toISOString().slice(0,16) : ''
const isoDate = (value:string) => value ? new Date(value).toISOString() : null

async function load(){ loading.value=true; error.value=''; try{ rows.value=await apiCollection<Competition>('/admin/competitions') }catch(reason:any){ error.value=reason.message||'赛事数据加载失败。' }finally{ loading.value=false } }
function create(){ Object.assign(form,{id:'',title:'',category:'DOMESTIC',operator:'',status:'报名中',scope:'',description:'',tags:'',url:'',startAt:'',endAt:'',registrationDeadline:'',published:true,featured:false}); modal.value=true; error.value='' }
function edit(item:Competition){ Object.assign(form,{...item,tags:item.tags.join('，'),startAt:inputDate(item.startAt),endAt:inputDate(item.endAt),registrationDeadline:inputDate(item.registrationDeadline)}); modal.value=true; error.value='' }
async function save(){
  saving.value=true; error.value=''
  const payload:CompetitionInput={title:form.title,category:form.category,operator:form.operator,status:form.status,scope:form.scope,description:form.description,tags:form.tags.split(/[,，]/).map(item=>item.trim()).filter(Boolean),url:form.url,startAt:isoDate(form.startAt),endAt:isoDate(form.endAt),registrationDeadline:isoDate(form.registrationDeadline),published:form.published,featured:form.featured}
  try{ await api(form.id?`/admin/competitions/${form.id}`:'/admin/competitions',{method:form.id?'PATCH':'POST',body:JSON.stringify(payload)}); notice.value=form.published?'赛事已保存并发布到学员端。':'赛事草稿已保存。'; modal.value=false; await load() }catch(reason:any){ error.value=reason.message||'赛事保存失败。' }finally{ saving.value=false }
}
async function toggle(item:Competition){ error.value=''; try{ await api(`/admin/competitions/${item.id}`,{method:'PATCH',body:JSON.stringify({published:!item.published})}); notice.value=item.published?'赛事已下架。':'赛事已发布。'; await load() }catch(reason:any){error.value=reason.message} }
async function remove(){ if(!deleting.value)return; saving.value=true; error.value=''; try{const title=deleting.value.title;await api(`/admin/competitions/${deleting.value.id}`,{method:'DELETE'});deleting.value=undefined;notice.value=`赛事“${title}”已删除。`;await load()}catch(reason:any){error.value=reason.message}finally{saving.value=false} }
onMounted(load)
</script>

<template>
  <div class="admin-management-page admin-competition-page">
    <section class="admin-list-summary"><article><i class="indigo">◇</i><div><small>全部赛事</small><b>{{rows.length}}</b></div><span>包含发布与草稿</span></article><article><i class="emerald">✓</i><div><small>学员端可见</small><b>{{publishedCount}}</b></div><span>正在对外展示</span></article><article><i class="amber">≡</i><div><small>待发布草稿</small><b>{{draftCount}}</b></div><span>仅管理员可见</span></article><article><i class="violet">✦</i><div><small>推荐赛事</small><b>{{featuredCount}}</b></div><span>优先显示在列表前方</span></article></section>
    <section class="admin-panel admin-data-panel">
      <div class="admin-data-head"><div><span>EVENT DIRECTORY</span><h2>赛事管理</h2><p>维护赛事入口、赛程信息与发布状态，已发布内容会同步到学员端。</p></div><button class="admin-primary" @click="create">＋ 发布赛事</button></div>
      <div v-if="notice" class="admin-toast success"><span>✓</span>{{notice}}<button @click="notice=''">×</button></div><div v-if="error&&!modal&&!deleting" class="admin-alert">{{error}}</div>
      <div class="admin-toolbar"><label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索赛事名称、主办方或简介"></label><div class="admin-segments"><button :class="{active:filter==='ALL'}" @click="filter='ALL'">全部 {{rows.length}}</button><button :class="{active:filter==='PUBLISHED'}" @click="filter='PUBLISHED'">已发布 {{publishedCount}}</button><button :class="{active:filter==='DRAFT'}" @click="filter='DRAFT'">草稿 {{draftCount}}</button></div></div>
      <div class="admin-competition-list">
        <article v-for="item in filtered" :key="item.id"><div class="admin-event-date"><b>{{item.startAt?new Date(item.startAt).getDate().toString().padStart(2,'0'):'--'}}</b><span>{{item.startAt?`${new Date(item.startAt).getMonth()+1}月`:'待定'}}</span></div><div class="admin-event-body"><div><span :class="['admin-status',item.published?'published':'draft']">{{item.published?'已发布':'草稿'}}</span><em>{{categoryLabel[item.category]}}</em><i v-if="item.featured">推荐</i></div><h3>{{item.title}}</h3><p>{{item.description}}</p><small>{{item.operator}} · {{item.scope}} · 更新于 {{formatDate(item.updatedAt)}}</small></div><div class="admin-event-schedule"><span>报名截止</span><b>{{formatDate(item.registrationDeadline)}}</b><span>比赛时间</span><b>{{formatDate(item.startAt)}}</b></div><div class="admin-notice-actions"><button @click="toggle(item)">{{item.published?'下架':'发布'}}</button><button @click="edit(item)">编辑</button><button class="danger" @click="deleting=item">删除</button></div></article>
        <div v-if="loading" class="admin-empty">正在读取赛事数据…</div><div v-else-if="!filtered.length" class="admin-empty">没有符合当前条件的赛事。</div>
      </div>
    </section>
  </div>
  <div v-if="modal" class="admin-modal-layer" @mousedown.self="modal=false"><form class="admin-modal admin-challenge-editor admin-competition-editor" @submit.prevent="save"><div class="admin-modal-head"><div><span>{{form.id?'EDIT EVENT':'NEW EVENT'}}</span><h2>{{form.id?'编辑赛事':'发布新赛事'}}</h2></div><button type="button" @click="modal=false">×</button></div><p>填写可验证的官方信息；未确认的赛事可先保存为草稿。</p>
    <section class="admin-editor-section"><h3>基本信息</h3><div class="admin-form-grid"><label>赛事名称<input v-model.trim="form.title" required minlength="2" maxlength="120"></label><label>赛事分类<select v-model="form.category"><option value="INTERNATIONAL">国际公开</option><option value="DOMESTIC">国内联赛</option><option value="UNIVERSITY">高校竞赛</option></select></label><label>主办方<input v-model.trim="form.operator" required maxlength="120"></label><label>当前状态<input v-model.trim="form.status" required placeholder="报名中 / 即将开始 / 持续更新"></label><label>参赛范围<input v-model.trim="form.scope" required placeholder="国内 · 团队赛"></label><label>标签<input v-model.trim="form.tags" placeholder="Web，Pwn，团队赛"></label></div><label>赛事简介<textarea v-model.trim="form.description" required minlength="10" maxlength="2000" rows="4"></textarea></label><label>官方链接<input v-model.trim="form.url" required type="url" placeholder="https://"></label></section>
    <section class="admin-editor-section"><h3>时间安排</h3><div class="admin-form-grid"><label>报名截止<input v-model="form.registrationDeadline" type="datetime-local"></label><label>开始时间<input v-model="form.startAt" type="datetime-local"></label><label>结束时间<input v-model="form.endAt" type="datetime-local"></label></div></section>
    <section class="admin-editor-section admin-event-options"><label class="admin-switch"><input v-model="form.published" type="checkbox"><i></i><span><b>发布到学员端</b><small>关闭后仅保存为管理员草稿</small></span></label><label class="admin-switch"><input v-model="form.featured" type="checkbox"><i></i><span><b>设为推荐赛事</b><small>推荐赛事会优先排列</small></span></label></section>
    <div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button type="button" @click="modal=false">取消</button><button class="admin-primary" :disabled="saving">{{saving?'正在保存…':form.published?'保存并发布':'保存草稿'}}</button></div></form></div>
  <div v-if="deleting" class="admin-modal-layer" @mousedown.self="deleting=undefined"><div class="admin-modal admin-confirm"><i>!</i><h2>删除这项赛事？</h2><p>“{{deleting.title}}”将从管理记录和学员端永久移除。</p><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button @click="deleting=undefined">取消</button><button class="admin-danger" :disabled="saving" @click="remove">{{saving?'正在删除…':'确认删除'}}</button></div></div></div>
</template>
