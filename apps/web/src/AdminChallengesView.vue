<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, apiCollection } from './api'
import type { AdminChallengeRecord, AdminLabRecord, ChallengeCategory, ChallengeDiagnostic, ChallengeDifficulty } from '@cyberquest/shared'

type Tab = 'challenges' | 'templates' | 'knowledge' | 'operations'
const tab = ref<Tab>('challenges')
const challenges = ref<AdminChallengeRecord[]>([])
const labs = ref<AdminLabRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const query = ref('')
const statusFilter = ref<'ALL' | 'ACTIVE' | 'DRAFT'>('ALL')
const editor = ref(false)
const deleting = ref<AdminChallengeRecord>()
const diagnostic = ref<{ challenge: AdminChallengeRecord; result?: ChallengeDiagnostic }>()
const notice = ref('')
const error = ref('')
const defaultGuideSteps = '确认正常行为 | 使用题目提供的入口完成一次基线操作，记录请求、输入与输出 | 得到正常响应并确认可控字段\n定位漏洞条件 | 结合页面、附件或流量证据定位信任边界缺陷 | 找到可复现且范围最小的漏洞触发条件\n完成利用验证 | 构造最小化输入并复现漏洞，记录关键证据 | 靶场返回当前会话 Flag'
const form = reactive({ id:'', slug:'', title:'', category:'WEB' as ChallengeCategory, difficulty:'EASY' as ChallengeDifficulty, points:100, description:'', goal:'', tags:'', flag:'', isActive:false, isDynamic:true, labKind:'AUTO', labTtlMinutes:30, skillSlug:'http', xpReward:80, guideSummary:'', guidePrinciple:'', guideSteps:defaultGuideSteps })

const categories: Array<{value:ChallengeCategory;label:string}> = [{value:'WEB',label:'Web 安全'},{value:'CRYPTO',label:'密码学'},{value:'NETWORK',label:'网络分析'},{value:'FORENSICS',label:'取证分析'},{value:'REVERSE',label:'逆向工程'},{value:'PWN',label:'二进制安全'},{value:'MISC',label:'综合'}]
const skillOptions = [
  {slug:'http',name:'HTTP 与信任边界',description:'请求、身份、会话与输入验证'},
  {slug:'crypto-basics',name:'编码与密码基础',description:'编码、哈希与密码学概念'},
  {slug:'packet-analysis',name:'流量分析',description:'协议、时序与应用层证据'},
  {slug:'reverse-basics',name:'静态分析',description:'字符串、控制流与程序意图'},
  {slug:'memory-safety',name:'内存安全',description:'边界检查与内存布局'},
]
const filtered = computed(() => { const keyword=query.value.trim().toLowerCase(); return challenges.value.filter(item => (statusFilter.value==='ALL'||(statusFilter.value==='ACTIVE'?item.isActive:!item.isActive))&&(!keyword||`${item.title} ${item.slug} ${item.category}`.toLowerCase().includes(keyword))) })
const activeCount = computed(() => challenges.value.filter(item=>item.isActive).length)
const categoryName = (value:string) => categories.find(item=>item.value===value)?.label || value
const difficultyName = (value:string) => ({EASY:'简单',MEDIUM:'中等',HARD:'困难'} as Record<string,string>)[value] || value
const formatDate = (value?:string) => value ? new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—'

async function load() {
  loading.value=true; error.value=''
  try { const [challengeRows,labRows]=await Promise.all([apiCollection<AdminChallengeRecord>('/admin/challenges'),api<AdminLabRecord[]>('/admin/labs')]); challenges.value=challengeRows; labs.value=labRows }
  catch(reason:any){ error.value=reason.message||'题目管理数据加载失败。' }
  finally{ loading.value=false }
}
function resetForm(){ Object.assign(form,{id:'',slug:'',title:'',category:'WEB',difficulty:'EASY',points:100,description:'',goal:'',tags:'',flag:'',isActive:false,isDynamic:true,labKind:'AUTO',labTtlMinutes:30,skillSlug:'http',xpReward:80,guideSummary:'',guidePrinciple:'',guideSteps:defaultGuideSteps}) }
function create(){ resetForm(); editor.value=true; error.value='' }
function edit(item:AdminChallengeRecord){ Object.assign(form,{id:item.id,slug:item.slug,title:item.title,category:item.category,difficulty:item.difficulty,points:item.points,description:item.description,goal:item.goal,tags:item.tags.join('、'),flag:'',isActive:item.isActive,isDynamic:item.isDynamic,labKind:item.labKind,labTtlMinutes:item.labTtlMinutes,skillSlug:item.skillSlug||'',xpReward:item.xpReward||item.points,guideSummary:item.guideSummary,guidePrinciple:item.guidePrinciple,guideSteps:item.guideSteps}); editor.value=true; error.value='' }
function duplicate(item:AdminChallengeRecord){ edit(item); form.id=''; form.slug=`${item.slug}-copy`; form.title=`${item.title}（副本）`; form.flag=''; form.isActive=false }
async function save(){ saving.value=true;error.value='';try{const payload={slug:form.slug,title:form.title,category:form.category,difficulty:form.difficulty,points:form.points,description:form.description,goal:form.goal,tags:[...new Set(form.tags.split(/[、,，]/).map(tag=>tag.trim()).filter(Boolean))],...(form.flag?{flag:form.flag}:{}),isActive:form.isActive,isDynamic:form.isDynamic,labKind:form.labKind,labTtlMinutes:form.labTtlMinutes,skillSlug:form.skillSlug,xpReward:form.xpReward,guideSummary:form.guideSummary,guidePrinciple:form.guidePrinciple,guideSteps:form.guideSteps};await api(form.id?`/admin/challenges/${form.id}`:'/admin/challenges',{method:form.id?'PATCH':'POST',body:JSON.stringify(payload)});notice.value=form.id?'题目配置与官方题解已更新。':'新题已创建，发布前建议先运行诊断并完整试玩。';editor.value=false;await load()}catch(reason:any){error.value=reason.message||'题目保存失败。'}finally{saving.value=false}}
async function toggle(item:AdminChallengeRecord){try{await api(`/admin/challenges/${item.id}`,{method:'PATCH',body:JSON.stringify({isActive:!item.isActive})});notice.value=item.isActive?'题目已下架，学员端不再展示。':'题目已发布。';await load()}catch(reason:any){error.value=reason.message}}
async function remove(){if(!deleting.value)return;saving.value=true;try{await api(`/admin/challenges/${deleting.value.id}`,{method:'DELETE'});notice.value='题目已删除。';deleting.value=undefined;await load()}catch(reason:any){error.value=reason.message}finally{saving.value=false}}
async function diagnose(item:AdminChallengeRecord){diagnostic.value={challenge:item};error.value='';try{diagnostic.value={challenge:item,result:await api<ChallengeDiagnostic>(`/admin/challenges/${item.id}/diagnose`,{method:'POST'})}}catch(reason:any){error.value=reason.message}}
function diagnoseLab(item:AdminLabRecord){const challenge=challenges.value.find(candidate=>candidate.id===item.challengeId);if(challenge)diagnose(challenge);else error.value='该实例对应的题目已不存在，无法运行题目诊断。'}
async function stopLab(item:AdminLabRecord){try{await api(`/admin/labs/${item.instanceId}/stop`,{method:'POST'});notice.value=`“${item.challengeTitle}”的靶场实例已停止。`;await load()}catch(reason:any){error.value=reason.message}}
onMounted(load)
</script>

<template>
  <div class="admin-content-page">
    <nav class="admin-content-tabs">
      <button :class="{active:tab==='challenges'}" @click="tab='challenges'"><i>01</i><span><b>题目管理</b><small>创建、编辑与上下架</small></span></button>
      <button :class="{active:tab==='templates'}" @click="tab='templates'"><i>02</i><span><b>靶场模板</b><small>运行方式与资源</small></span></button>
      <button :class="{active:tab==='knowledge'}" @click="tab='knowledge'"><i>03</i><span><b>知识关联</b><small>能力方向与覆盖</small></span></button>
      <button :class="{active:tab==='operations'}" @click="tab='operations'"><i>04</i><span><b>运行运维</b><small>诊断与实例处置</small></span></button>
    </nav>
    <div v-if="notice" class="admin-toast success"><span>✓</span>{{notice}}<button @click="notice=''">×</button></div>
    <div v-if="error&&!editor&&!deleting" class="admin-alert">{{error}}</div>

    <section v-if="tab==='challenges'" class="admin-panel admin-content-panel">
      <div class="admin-content-panel-head"><div><span>CHALLENGE LIBRARY</span><h2>CTF 题目</h2></div><button class="admin-primary" @click="create">＋ 创建题目</button></div>
      <div class="admin-toolbar"><label class="admin-search"><span>⌕</span><input v-model="query" placeholder="搜索题目、Slug 或分类"></label><div class="admin-segments"><button :class="{active:statusFilter==='ALL'}" @click="statusFilter='ALL'">全部 {{challenges.length}}</button><button :class="{active:statusFilter==='ACTIVE'}" @click="statusFilter='ACTIVE'">已发布 {{activeCount}}</button><button :class="{active:statusFilter==='DRAFT'}" @click="statusFilter='DRAFT'">已下架 {{challenges.length-activeCount}}</button></div></div>
      <div class="admin-challenge-list">
        <article v-for="item in filtered" :key="item.id">
          <div class="admin-challenge-code"><span>{{item.category}}</span><b>{{item.slug}}</b></div>
          <div class="admin-challenge-main"><div><span :class="['admin-status',item.isActive?'published':'draft']">{{item.isActive?'已发布':'已下架'}}</span><span class="admin-difficulty">{{difficultyName(item.difficulty)}}</span><span v-if="item.isDynamic" class="admin-dynamic">动态 Flag</span></div><h3>{{item.title}}</h3><p>{{item.description}}</p><small>{{categoryName(item.category)}} · {{item.points}} 积分 · {{item.tags.join(' / ')}}</small></div>
          <div class="admin-challenge-health"><b>{{item.completionRate}}%</b><span>提交通过率</span><small>{{item.incorrectAttempts}} 次错误 · {{item.averageSolveMinutes===undefined?'暂无用时':`${item.averageSolveMinutes} 分钟`}}</small></div>
          <div class="admin-challenge-actions"><button @click="diagnose(item)">诊断</button><RouterLink :to="`/challenges/${item.slug}`">试玩 ↗</RouterLink><button @click="edit(item)">编辑</button><button @click="duplicate(item)">复制</button><button @click="toggle(item)">{{item.isActive?'下架':'发布'}}</button><button class="danger" @click="deleting=item">删除</button></div>
        </article>
        <div v-if="loading" class="admin-empty">正在读取题目配置…</div><div v-else-if="!filtered.length" class="admin-empty">没有符合当前筛选的题目。</div>
      </div>
    </section>

    <section v-else-if="tab==='templates'" class="admin-template-grid">
      <article v-for="item in challenges" :key="item.id" class="admin-panel admin-template-card"><div class="admin-template-top"><i>{{item.category==='WEB'?'网':'档'}}</i><span><b>{{item.title}}</b><small>{{item.slug}}</small></span><em :class="{off:!item.isActive}">{{item.isActive?'可启动':'已停用'}}</em></div><dl><div><dt>模板类型</dt><dd>{{item.labKind==='WEB_APPLICATION'?'网页应用靶场':item.labKind==='ARTIFACT_ANALYSIS'?'材料分析靶场':'自动匹配'}}</dd></div><div><dt>有效时间</dt><dd>{{item.labTtlMinutes}} 分钟</dd></div><div><dt>Flag</dt><dd>{{item.isDynamic?'会话动态生成':'静态验证'}}</dd></div><div><dt>附件</dt><dd>{{item.attachmentCount}} 项</dd></div></dl><div class="admin-template-actions"><button @click="diagnose(item)">运行诊断</button><button @click="edit(item)">配置模板</button><RouterLink :to="`/challenges/${item.slug}`">管理员试玩 ↗</RouterLink></div></article>
    </section>

    <section v-else-if="tab==='knowledge'" class="admin-knowledge-grid">
      <article v-for="skill in skillOptions" :key="skill.slug" class="admin-panel"><div class="admin-knowledge-head"><i>{{skill.name.slice(0,1)}}</i><div><span>KNOWLEDGE DOMAIN</span><h3>{{skill.name}}</h3><p>{{skill.description}}</p></div><b>{{challenges.filter(c=>c.skillSlug===skill.slug).length}} 题</b></div><div class="admin-knowledge-links"><template v-if="challenges.some(c=>c.skillSlug===skill.slug)"><button v-for="item in challenges.filter(c=>c.skillSlug===skill.slug)" :key="item.id" @click="edit(item)"><span>{{item.title}}</span><small>{{item.xpReward||0}} XP</small><em>编辑关联 →</em></button></template><div v-else class="admin-knowledge-empty">尚未关联题目</div></div></article>
      <aside class="admin-knowledge-note"><b>知识覆盖规则</b><p>每道题关联一个主要能力方向和经验奖励。题目说明、靶场目标与官方题解应围绕同一知识点编写，避免同质化内容。</p><span>编辑题目即可调整知识关联</span></aside>
    </section>

    <section v-else class="admin-panel admin-ops-panel">
      <div class="admin-content-panel-head"><div><span>RANGE OPERATIONS</span><h2>靶场运行运维</h2><p>查看最近 100 个实例，异常时可强制停止并重新诊断题目。</p></div><button @click="load">↻ 刷新状态</button></div>
      <div class="admin-ops-list"><div class="admin-ops-head"><span>题目 / 实例</span><span>学员</span><span>状态</span><span>启动与到期</span><span>操作</span></div><article v-for="item in labs" :key="item.instanceId"><div><b>{{item.challengeTitle}}</b><small>{{item.instanceId}}</small></div><span>{{item.username}}</span><span :class="['admin-lab-status',item.status.toLowerCase()]"><i></i>{{item.status==='RUNNING'?'运行中':item.status==='EXPIRED'?'已过期':item.status==='STOPPED'?'已停止':'异常'}}</span><div><small>启动 {{formatDate(item.startedAt)}}</small><small>到期 {{formatDate(item.expiresAt)}}</small></div><div><button @click="diagnoseLab(item)">诊断题目</button><button class="danger" :disabled="item.status!=='RUNNING'" @click="stopLab(item)">停止实例</button></div></article><div v-if="!labs.length&&!loading" class="admin-empty">当前没有靶场运行记录。</div></div>
    </section>
  </div>

  <div v-if="editor" class="admin-modal-layer" @mousedown.self="editor=false">
    <form class="admin-modal admin-challenge-editor" @submit.prevent="save">
      <div class="admin-modal-head"><div><span>{{form.id?'EDIT CHALLENGE':'NEW CHALLENGE'}}</span><h2>{{form.id?'编辑题目配置':'创建 CTF 题目'}}</h2></div><button type="button" @click="editor=false">×</button></div>
      <div class="admin-editor-section">
        <h3>基础信息</h3>
        <div class="admin-form-grid"><label>题目标识 Slug<input v-model.trim="form.slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="例如 web-201"></label><label>题目名称<input v-model.trim="form.title" required minlength="2"></label><label>题目分类<select v-model="form.category"><option v-for="item in categories" :key="item.value" :value="item.value">{{item.label}}</option></select></label><label>难度<select v-model="form.difficulty"><option value="EASY">简单</option><option value="MEDIUM">中等</option><option value="HARD">困难</option></select></label><label>题目积分<input v-model.number="form.points" type="number" min="0" max="10000"></label><label>动态 Flag<select v-model="form.isDynamic"><option :value="true">启用</option><option :value="false">关闭</option></select></label></div>
        <label>题目简介<textarea v-model.trim="form.description" required rows="3"></textarea></label>
        <label>解题目标<textarea v-model.trim="form.goal" required rows="3"></textarea></label>
        <label>题目标签<input v-model.trim="form.tags" placeholder="例如：IDOR、权限校验、HTTP（使用逗号或顿号分隔）"></label>
      </div>
      <div class="admin-editor-section admin-guide-editor">
        <div class="admin-editor-title"><div><h3>官方题解</h3><p>通关后免费开放；未通关学员消耗 20 积分解锁。不要写死会话 Flag。</p></div><span>STRUCTURED WRITEUP</span></div>
        <label>漏洞或解题原理<textarea v-model.trim="form.guidePrinciple" required rows="3" placeholder="解释漏洞产生原因、算法原理或证据链依据"></textarea></label>
        <label>题解摘要<textarea v-model.trim="form.guideSummary" required rows="2" placeholder="简洁说明完整解题路线"></textarea></label>
        <label>复现步骤<textarea v-model.trim="form.guideSteps" required rows="7" placeholder="每行：步骤标题 | 操作说明 | 预期结果"></textarea><small class="admin-guide-help">每行一个步骤，使用竖线分隔标题、操作和预期结果。保存后会生成学员端的分步官方题解。</small></label>
      </div>
      <div class="admin-editor-section">
        <h3>验证与靶场</h3>
        <div class="admin-form-grid"><label>{{form.id?'更新 Flag（留空不变）':'验证 Flag'}}<input v-model="form.flag" :required="!form.id" minlength="6" placeholder="只会哈希写入后端"></label><label>靶场模板<select v-model="form.labKind"><option value="AUTO">按题目类型自动匹配</option><option value="WEB_APPLICATION">网页应用靶场</option><option value="ARTIFACT_ANALYSIS">材料分析靶场</option></select></label><label>有效时间（分钟）<input v-model.number="form.labTtlMinutes" type="number" min="5" max="180"></label><label>能力方向<select v-model="form.skillSlug"><option value="">暂不关联</option><option v-for="item in skillOptions" :key="item.slug" :value="item.slug">{{item.name}}</option></select></label><label>经验奖励<input v-model.number="form.xpReward" type="number" min="0" max="10000"></label><label>发布状态<select v-model="form.isActive"><option :value="false">先存为下架状态</option><option :value="true">保存后立即发布</option></select></label></div>
      </div>
      <div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button type="button" @click="editor=false">取消</button><button class="admin-primary" :disabled="saving">{{saving?'正在保存…':form.id?'保存修改':'创建题目'}}</button></div>
    </form>
  </div>
  <div v-if="deleting" class="admin-modal-layer" @mousedown.self="deleting=undefined"><div class="admin-modal admin-confirm"><i>!</i><h2>确认删除题目？</h2><p>“{{deleting.title}}”只有在没有答题、笔记和靶场历史时才能删除。已有历史的题目请使用“下架”。</p><div v-if="error" class="admin-alert">{{error}}</div><div class="admin-modal-actions"><button @click="deleting=undefined">取消</button><button class="admin-danger" :disabled="saving" @click="remove">确认删除</button></div></div></div>
  <div v-if="diagnostic" class="admin-modal-layer" @mousedown.self="diagnostic=undefined"><div class="admin-modal admin-diagnostic"><div class="admin-modal-head"><div><span>MAINTENANCE DIAGNOSTIC</span><h2>{{diagnostic.challenge.title}}</h2></div><button @click="diagnostic=undefined">×</button></div><p>检查题目元数据、Flag 验证、靶场生成和官方题解完整性。</p><div v-if="!diagnostic.result" class="admin-empty">正在运行诊断…</div><template v-else><div :class="['admin-diagnostic-summary',diagnostic.result.healthy?'healthy':'warning']"><i>{{diagnostic.result.healthy?'✓':'!'}}</i><span><b>{{diagnostic.result.healthy?'全部检查通过':'发现配置问题'}}</b><small>{{formatDate(diagnostic.result.checkedAt)}}</small></span></div><div class="admin-diagnostic-check" v-for="check in diagnostic.result.checks" :key="check.name"><i :class="{ok:check.ok}">{{check.ok?'✓':'×'}}</i><span><b>{{check.name}}</b><small>{{check.detail}}</small></span></div></template><div class="admin-modal-actions"><RouterLink :to="`/challenges/${diagnostic.challenge.slug}`">进入工作台试玩 ↗</RouterLink><button class="admin-primary" @click="diagnostic=undefined">完成</button></div></div></div>
</template>
