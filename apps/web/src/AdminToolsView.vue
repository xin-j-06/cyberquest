<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import type { TrainingTool, TrainingToolInput } from '@cyberquest/shared'

const rows = ref<TrainingTool[]>([])
const loading = ref(true), saving = ref(false), modal = ref(false)
const query = ref(''), filter = ref<'ALL'|'PUBLISHED'|'DRAFT'>('ALL'), error = ref(''), notice = ref('')
const deleting = ref<TrainingTool>()
const form = reactive({ id:'', name:'', icon:'', category:'Web 安全', description:'', platforms:'', source:'', usagePath:'', officialUrl:'', actionLabel:'前往官方下载', installCommand:'', published:true, recommended:false, sortOrder:0 })
const categories = ['Web 安全','流量分析','网络工具','密码编码','逆向工程','二进制安全','数字取证','开发辅助','其他']
const filtered = computed(() => rows.value.filter(item => (filter.value==='ALL'||(filter.value==='PUBLISHED'?item.published:!item.published)) && (!query.value.trim() || `${item.name} ${item.category} ${item.description} ${item.source} ${item.usagePath}`.toLowerCase().includes(query.value.trim().toLowerCase()))))
const publishedCount = computed(() => rows.value.filter(item=>item.published).length)
const draftCount = computed(() => rows.value.filter(item=>!item.published).length)
const recommendedCount = computed(() => rows.value.filter(item=>item.recommended).length)

async function load(){ loading.value=true; error.value=''; try{ rows.value=await apiCollection<TrainingTool>('/admin/tools') }catch(reason:any){ error.value=reason.message||'工具数据加载失败。' }finally{ loading.value=false } }
function create(){ Object.assign(form,{id:'',name:'',icon:'',category:'Web 安全',description:'',platforms:'Windows，macOS，Linux',source:'',usagePath:'',officialUrl:'',actionLabel:'前往官方下载',installCommand:'',published:true,recommended:false,sortOrder:rows.value.length*10}); modal.value=true; error.value='' }
function edit(item:TrainingTool){ Object.assign(form,{...item,platforms:item.platforms.join('，'),installCommand:item.installCommand??''}); modal.value=true; error.value='' }
async function save(){
  saving.value=true; error.value=''
  const payload:TrainingToolInput={name:form.name,icon:form.icon,category:form.category,description:form.description,platforms:form.platforms.split(/[,，]/).map(value=>value.trim()).filter(Boolean),source:form.source,usagePath:form.usagePath,officialUrl:form.officialUrl,actionLabel:form.actionLabel,installCommand:form.installCommand,published:form.published,recommended:form.recommended,sortOrder:Number(form.sortOrder)||0}
  try{ await api(form.id?`/admin/tools/${form.id}`:'/admin/tools',{method:form.id?'PATCH':'POST',body:JSON.stringify(payload)}); notice.value=form.published?'工具已保存并同步到学员端。':'工具草稿已保存。'; modal.value=false; await load() }catch(reason:any){ error.value=reason.message||'工具保存失败。' }finally{ saving.value=false }
}
async function toggle(item:TrainingTool){ error.value=''; try{ await api(`/admin/tools/${item.id}`,{method:'PATCH',body:JSON.stringify({published:!item.published})}); notice.value=item.published?'工具已下架。':'工具已发布。'; await load() }catch(reason:any){error.value=reason.message||'状态更新失败。'} }
async function remove(){ if(!deleting.value)return; saving.value=true; error.value=''; try{const name=deleting.value.name;await api(`/admin/tools/${deleting.value.id}`,{method:'DELETE'});deleting.value=undefined;notice.value=`工具“${name}”已删除。`;await load()}catch(reason:any){error.value=reason.message||'删除失败。'}finally{saving.value=false} }
onMounted(load)
</script>

<template>
  <div class="admin-management-page admin-tools-page">
    <section class="admin-list-summary admin-tool-summary">
      <article><i class="indigo">⌘</i><div><small>全部工具</small><b>{{rows.length}}</b></div><span>安装、在线与辅助工具</span></article>
      <article><i class="emerald">✓</i><div><small>学员端可见</small><b>{{publishedCount}}</b></div><span>已同步到常用工具</span></article>
      <article><i class="amber">≡</i><div><small>待发布草稿</small><b>{{draftCount}}</b></div><span>仅管理员可查看</span></article>
      <article><i class="violet">✦</i><div><small>推荐工具</small><b>{{recommendedCount}}</b></div><span>进入推荐入门组合</span></article>
    </section>

    <section class="admin-panel admin-data-panel">
      <div class="admin-data-head"><div><span>TOOL DIRECTORY</span><h2>工具管理</h2><p>维护工具用途、使用路径、安装命令与官方下载入口，发布后自动同步到学员端。</p></div><button class="admin-primary" @click="create">＋ 新增工具</button></div>
      <div v-if="notice" class="admin-toast success"><span>✓</span>{{notice}}<button @click="notice=''">×</button></div>
      <div v-if="error&&!modal&&!deleting" class="admin-alert">{{error}}</div>
      <div class="admin-toolbar"><label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索工具名称、分类、用途或来源"></label><div class="admin-segments"><button :class="{active:filter==='ALL'}" @click="filter='ALL'">全部 {{rows.length}}</button><button :class="{active:filter==='PUBLISHED'}" @click="filter='PUBLISHED'">已发布 {{publishedCount}}</button><button :class="{active:filter==='DRAFT'}" @click="filter='DRAFT'">草稿 {{draftCount}}</button></div></div>

      <div class="admin-tool-list">
        <article v-for="item in filtered" :key="item.id">
          <div class="admin-tool-icon">{{item.icon}}</div>
          <div class="admin-tool-body"><div><span :class="['admin-status',item.published?'published':'draft']">{{item.published?'已发布':'草稿'}}</span><em>{{item.category}}</em><i v-if="item.recommended">推荐</i></div><h3>{{item.name}}</h3><p>{{item.description}}</p><small>{{item.source}} · 排序 {{item.sortOrder}}</small></div>
          <div class="admin-tool-route"><span>使用路径</span><b>{{item.usagePath||'未填写'}}</b><a v-if="item.officialUrl" :href="item.officialUrl" target="_blank" rel="noopener noreferrer">检查官网 ↗</a><small v-else>未配置官网链接</small></div>
          <div class="admin-notice-actions"><button @click="toggle(item)">{{item.published?'下架':'发布'}}</button><button @click="edit(item)">编辑</button><button class="danger" @click="deleting=item">删除</button></div>
        </article>
        <div v-if="loading" class="admin-empty">正在读取工具数据…</div><div v-else-if="!filtered.length" class="admin-empty">没有符合当前条件的工具。</div>
      </div>
    </section>
  </div>

  <div v-if="modal" class="admin-modal-layer" @mousedown.self="modal=false"><form class="admin-modal admin-tool-editor" @submit.prevent="save"><div class="admin-modal-head"><div><span>{{form.id?'EDIT TOOL':'NEW TOOL'}}</span><h2>{{form.id?'编辑工具':'新增工具'}}</h2></div><button type="button" @click="modal=false">×</button></div><p>可只配置使用路径或官网链接，也可以同时提供；已发布内容会出现在学员端“常用工具”。</p>
    <section class="admin-editor-section"><h3>基本信息</h3><div class="admin-form-grid"><label>工具名称<input v-model.trim="form.name" required minlength="2" maxlength="120" placeholder="例如 Wireshark"></label><label>图标缩写<input v-model.trim="form.icon" maxlength="8" placeholder="例如 WS"></label><label>工具分类<input v-model.trim="form.category" required list="tool-categories"><datalist id="tool-categories"><option v-for="category in categories" :key="category" :value="category"></option></datalist></label><label>官方来源<input v-model.trim="form.source" required maxlength="120" placeholder="发布组织或官方仓库"></label></div><label>用途说明<textarea v-model.trim="form.description" required minlength="10" maxlength="2000" rows="3" placeholder="说明这个工具适用于哪些题目和分析场景"></textarea></label><label>适用平台<input v-model.trim="form.platforms" placeholder="Windows，macOS，Linux"></label></section>
    <section class="admin-editor-section"><h3>使用与获取</h3><label>使用路径<input v-model.trim="form.usagePath" maxlength="500" placeholder="例如：流量题 → 协议分析 → 追踪 TCP 流"></label><div class="admin-form-grid"><label>官网或官方下载地址<input v-model.trim="form.officialUrl" type="url" maxlength="1000" placeholder="https://"></label><label>链接按钮文字<input v-model.trim="form.actionLabel" maxlength="40" placeholder="前往官方下载"></label></div><label>安装命令（可选）<input v-model.trim="form.installCommand" maxlength="1000" placeholder="例如：python -m pip install ..."></label><label>展示顺序<input v-model.number="form.sortOrder" type="number" min="0" max="10000"></label></section>
    <section class="admin-editor-section admin-event-options"><label class="admin-switch"><input v-model="form.published" type="checkbox"><i></i><span><b>发布到学员端</b><small>关闭后仅保留为管理员草稿</small></span></label><label class="admin-switch"><input v-model="form.recommended" type="checkbox"><i></i><span><b>加入推荐组合</b><small>在工具页顶部快速入口中展示</small></span></label></section>
    <div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button type="button" @click="modal=false">取消</button><button class="admin-primary" :disabled="saving">{{saving?'正在保存…':form.published?'保存并发布':'保存草稿'}}</button></div></form></div>
  <div v-if="deleting" class="admin-modal-layer" @mousedown.self="deleting=undefined"><div class="admin-modal admin-confirm"><i>!</i><h2>删除这个工具？</h2><p>“{{deleting.name}}”将从后台记录和学员端工具目录永久移除。</p><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button @click="deleting=undefined">取消</button><button class="admin-danger" :disabled="saving" @click="remove">{{saving?'正在删除…':'确认删除'}}</button></div></div></div>
</template>
