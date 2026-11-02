<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'
import type { CalendarMemo, CalendarMemoInput, Competition } from '@cyberquest/shared'

const props=withDefaults(defineProps<{authenticated?:boolean}>(),{authenticated:false})
const router=useRouter()
const competitions=ref<Competition[]>([]),memos=ref<CalendarMemo[]>([]),loading=ref(true),error=ref('')
const cursor=ref(new Date(new Date().getFullYear(),new Date().getMonth(),1)),selectedDate=ref(dateKey(new Date()))
const modal=ref(false),saving=ref(false),deletingId=ref('')
const form=reactive({id:'',date:selectedDate.value,title:'',note:''})
const weekdays=['一','二','三','四','五','六','日']
const monthLabel=computed(()=>`${cursor.value.getFullYear()} 年 ${cursor.value.getMonth()+1} 月`)
const liveEvents=computed(()=>competitions.value.filter(isLive).slice(0,3))
const datedCount=computed(()=>competitions.value.filter(item=>item.startAt).length)
const selectedEvents=computed(()=>competitions.value.filter(item=>item.startAt&&dateKey(new Date(item.startAt))===selectedDate.value))
const selectedMemos=computed(()=>memos.value.filter(item=>item.date===selectedDate.value))
const days=computed(()=>{const year=cursor.value.getFullYear(),month=cursor.value.getMonth(),first=new Date(year,month,1),offset=(first.getDay()+6)%7;return Array.from({length:42},(_,index)=>{const date=new Date(year,month,index-offset+1),key=dateKey(date);return{key,day:date.getDate(),current:date.getMonth()===month,today:key===dateKey(new Date()),events:competitions.value.filter(item=>item.startAt&&dateKey(new Date(item.startAt))===key).length,memos:memos.value.filter(item=>item.date===key).length}})})

function dateKey(date:Date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function formatSelected(value:string){const[y,m,d]=value.split('-');return`${y}年${Number(m)}月${Number(d)}日`}
function isLive(item:Competition){const now=Date.now(),start=item.startAt?new Date(item.startAt).getTime():0,end=item.endAt?new Date(item.endAt).getTime():0;return Boolean((start&&start<=now&&(!end||end>=now))||/进行中|持续更新/.test(item.status))}
function changeMonth(step:number){cursor.value=new Date(cursor.value.getFullYear(),cursor.value.getMonth()+step,1)}
function openMemo(item?:CalendarMemo){if(!props.authenticated){void router.push({path:'/login',query:{redirect:'/'}});return}Object.assign(form,item?{id:item.id,date:item.date,title:item.title,note:item.note}:{id:'',date:selectedDate.value,title:'',note:''});modal.value=true;error.value=''}
async function load(){loading.value=true;error.value='';try{competitions.value=await api<Competition[]>('/competitions');if(props.authenticated)memos.value=await api<CalendarMemo[]>('/calendar/memos')}catch(reason:unknown){error.value=reason instanceof Error?reason.message:'日历数据加载失败。'}finally{loading.value=false}}
async function saveMemo(){saving.value=true;error.value='';const payload:CalendarMemoInput={date:form.date,title:form.title,note:form.note};try{const saved=await api<CalendarMemo>(form.id?`/calendar/memos/${form.id}`:'/calendar/memos',{method:form.id?'PATCH':'POST',body:JSON.stringify(payload)});memos.value=form.id?memos.value.map(item=>item.id===saved.id?saved:item):[...memos.value,saved];selectedDate.value=saved.date;modal.value=false}catch(reason:any){error.value=reason.message||'备忘录保存失败。'}finally{saving.value=false}}
async function removeMemo(item:CalendarMemo){deletingId.value=item.id;try{await api(`/calendar/memos/${item.id}`,{method:'DELETE'});memos.value=memos.value.filter(row=>row.id!==item.id)}catch(reason:any){error.value=reason.message||'备忘录删除失败。'}finally{deletingId.value=''}}
onMounted(load)
</script>

<template>
  <section class="profile-calendar home-calendar">
    <header><div><span class="eyebrow">EVENT CALENDAR</span><h2>赛事日历</h2><p>查看实时赛事，并记录报名、组队和训练安排。</p></div><button @click="openMemo()">{{authenticated?'＋ 添加备忘':'登录后添加备忘'}}</button></header>
    <div v-if="loading" class="calendar-loading">正在同步赛事日历…</div>
    <div v-else class="calendar-workspace">
      <div class="calendar-sheet"><div class="calendar-month"><button @click="changeMonth(-1)">‹</button><b>{{monthLabel}}</b><button @click="changeMonth(1)">›</button></div><div class="calendar-week"><span v-for="day in weekdays" :key="day">{{day}}</span></div><div class="calendar-days"><button v-for="day in days" :key="day.key" :class="{muted:!day.current,today:day.today,selected:selectedDate===day.key}" @click="selectedDate=day.key"><b>{{day.day}}</b><span><i v-if="day.events"></i><em v-if="day.memos"></em></span></button></div></div>
      <aside class="calendar-agenda"><div class="agenda-title"><span>{{formatSelected(selectedDate)}}</span><button @click="openMemo()">{{authenticated?'＋':'登录'}}</button></div><div v-if="selectedEvents.length" class="agenda-events"><a v-for="item in selectedEvents" :key="item.id" :href="item.url" target="_blank" rel="noopener"><i></i><span><b>{{item.title}}</b><small>{{item.status}} · {{item.operator}}</small></span><em>↗</em></a></div><div v-if="selectedMemos.length" class="agenda-memos"><article v-for="item in selectedMemos" :key="item.id" @click="openMemo(item)"><i>MEMO</i><span><b>{{item.title}}</b><small>{{item.note||'没有补充说明'}}</small></span><button :disabled="deletingId===item.id" @click.stop="removeMemo(item)">×</button></article></div><div v-if="!selectedEvents.length&&!selectedMemos.length" class="agenda-empty"><i>○</i><p>{{authenticated?'这一天还没有赛事或备忘':'这一天暂无赛事，登录后可添加备忘'}}</p><button @click="openMemo()">{{authenticated?'添加一条备忘':'登录平台'}}</button></div><div class="live-events"><span><i></i>实时赛事</span><a v-for="item in (liveEvents.length?liveEvents:competitions.slice(0,2))" :key="item.id" :href="item.url" target="_blank" rel="noopener"><b>{{item.title}}</b><small>{{isLive(item)?'正在进行':'等待赛程更新'}} · {{item.status}}</small></a><p v-if="!competitions.length">暂无已发布赛事</p></div></aside>
    </div>
    <footer><span><i class="event-dot"></i>赛事日期</span><span v-if="authenticated"><i class="memo-dot"></i>个人备忘</span><b>{{datedCount}} 项赛事已设置日期<span v-if="authenticated"> · {{memos.length}} 条备忘</span></b></footer>
    <p v-if="error&&!modal" class="calendar-error">{{error}}</p>
  </section>
  <div v-if="modal" class="note-modal memo-modal" @click.self="modal=false"><form @submit.prevent="saveMemo"><header><div><span class="eyebrow">CALENDAR MEMO</span><h2>{{form.id?'编辑备忘':'添加备忘'}}</h2><p>记录报名截止、训练安排或赛事准备事项。</p></div><button type="button" @click="modal=false">×</button></header><div class="memo-form"><label>日期<input v-model="form.date" type="date" required></label><label>标题<input v-model.trim="form.title" maxlength="120" required placeholder="例如：完成赛事报名"></label><label>补充说明<textarea v-model.trim="form.note" maxlength="1000" rows="4" placeholder="可填写待办事项、组队信息或准备内容"></textarea></label><p v-if="error" class="profile-error">{{error}}</p></div><footer><button type="button" @click="modal=false">取消</button><button :disabled="saving">{{saving?'正在保存…':'保存备忘'}}</button></footer></form></div>
</template>
