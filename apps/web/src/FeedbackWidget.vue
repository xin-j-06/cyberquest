<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from './api'
import type { FeedbackRecord, FeedbackType } from '@cyberquest/shared'

const open = ref(false)
const sending = ref(false)
const sent = ref<FeedbackRecord>()
const error = ref('')
const form = reactive({ type: 'BUG' as FeedbackType, title: '', content: '' })

function close(){ open.value=false }
function reset(){ Object.assign(form,{type:'BUG',title:'',content:''}); sent.value=undefined; error.value='' }
async function submit(){
  sending.value=true; error.value=''
  try { sent.value=await api<FeedbackRecord>('/feedback',{method:'POST',body:JSON.stringify({type:form.type,title:form.title,content:form.content,pageUrl:window.location.pathname+window.location.search})}) }
  catch(reason:any){ error.value=reason.message||'反馈提交失败，请稍后再试。' }
  finally{ sending.value=false }
}
watch(open,value=>{if(value)error.value=''})
</script>

<template>
  <button class="feedback-rail" aria-label="打开意见反馈" :aria-expanded="open" @click="open=true"><i>◇</i><span>意见反馈</span></button>
  <Transition name="feedback-fade"><button v-if="open" class="feedback-backdrop" aria-label="关闭意见反馈" @click="close"></button></Transition>
  <Transition name="feedback-slide">
    <aside v-if="open" class="feedback-drawer" aria-label="意见反馈面板">
      <header><div><span>FEEDBACK</span><h2>告诉我们哪里需要改进</h2><p>提交系统错误或体验建议，管理员会在后台跟进。</p></div><button aria-label="关闭" @click="close">×</button></header>
      <div v-if="sent" class="feedback-success"><i>✓</i><span><b>反馈已提交</b><p>编号 {{sent.id.slice(0,8)}} 已进入管理员处理队列。</p></span></div>
      <form v-else @submit.prevent="submit">
        <fieldset><legend>反馈类型</legend><label :class="{active:form.type==='BUG'}"><input v-model="form.type" type="radio" value="BUG"><i>!</i><span><b>系统错误</b><small>功能异常、页面报错或数据问题</small></span></label><label :class="{active:form.type==='SUGGESTION'}"><input v-model="form.type" type="radio" value="SUGGESTION"><i>✦</i><span><b>优化建议</b><small>体验、内容或功能改进想法</small></span></label></fieldset>
        <label>标题<input v-model.trim="form.title" required minlength="2" maxlength="120" placeholder="用一句话概括问题"></label>
        <label>详细说明<textarea v-model.trim="form.content" required minlength="10" maxlength="5000" rows="8" placeholder="请说明发生了什么、期望结果以及复现方式…"></textarea><small>{{form.content.length}} / 5000</small></label>
        <div class="feedback-context"><span>当前页面</span><code>{{ $route.fullPath }}</code></div>
        <div v-if="error" class="feedback-error">{{error}}</div>
        <button class="feedback-submit" :disabled="sending">{{sending?'正在提交…':'提交反馈'}}<span>→</span></button>
      </form>
      <footer v-if="sent"><button @click="reset">继续反馈</button><button @click="close">完成</button></footer>
    </aside>
  </Transition>
</template>
