<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from './api'
import { useAuth } from './stores/auth'
import EventCalendar from './EventCalendar.vue'
import type { Announcement, DashboardStats, LeaderboardEntry, RangeOverview } from '@cyberquest/shared'

const auth=useAuth(),stats=ref<DashboardStats>(),range=ref<RangeOverview>(),announcements=ref<Announcement[]>([]),ranking=ref<LeaderboardEntry[]>([]),error=ref('')
const authenticated=computed(()=>Boolean(auth.user&&auth.token))
const greeting=computed(()=>auth.user?`${auth.user.username}，继续你的训练`:'欢迎来到赛博演武场')
const challengeTarget=computed(()=>authenticated.value?'/challenges':{path:'/login',query:{redirect:'/challenges'}})
const learningTarget=computed(()=>authenticated.value?'/learning':{path:'/login',query:{redirect:'/learning'}})
const progress=computed(()=>authenticated.value&&stats.value&&range.value?Math.min(100,(range.value.metrics.completed/Math.max(1,stats.value.totalChallenges))*100):0)
onMounted(async()=>{try{const[s,r,a,b]=await Promise.all([api<DashboardStats>('/dashboard/stats'),api<RangeOverview>('/range/overview'),api<Announcement[]>('/announcements'),api<LeaderboardEntry[]>('/leaderboard')]);stats.value=s;range.value=r;announcements.value=a;ranking.value=b}catch(reason:unknown){error.value=reason instanceof Error?reason.message:'平台数据暂时不可用。'}})
</script>

<template>
  <section v-if="stats&&range" class="home-dashboard">
    <div class="home-top"><div class="home-intro"><span class="eyebrow">CYBERQUEST / {{authenticated?'训练总览':'安全实战学习平台'}}</span><h1>{{greeting}}</h1><p>{{authenticated?'本地题目、练习会话与学习记录由后端统一保存。先从一项可验证的任务开始，而不是盲目刷题。':'在隔离靶场中完成真实、可验证的安全挑战，建立属于你的学习记录、能力图谱与竞赛履历。'}}</p><div class="home-actions"><RouterLink :to="challengeTarget" class="primary-link">{{authenticated?'进入题目库':'登录并开始训练'}} <i>→</i></RouterLink><RouterLink :to="learningTarget" class="secondary-link">{{authenticated?'查看学习路径':'了解学习路径'}}</RouterLink></div><small v-if="!authenticated" class="guest-note">新用户可在登录页面直接创建学习账号</small></div><aside class="today-panel"><header><span>{{authenticated?'今日训练':'TRAINING ACCESS'}}</span><b>{{authenticated?'本地学习状态':'登录后开启完整训练'}}</b></header><div class="today-progress"><i :style="{width:progress+'%'}"></i></div><div class="today-numbers"><template v-if="authenticated"><span><b>{{range.metrics.completed}}</b> 已完成</span><span><b>{{range.metrics.availableTasks}}</b> 可开始</span></template><template v-else><span><b>{{stats.totalChallenges}}</b> 开放题目</span><span><b>{{range.metrics.attachments}}</b> 练习材料</span></template></div><div class="today-note"><i></i>{{authenticated?(range.sessions.length?'当前有训练会话正在运行':'尚未启动训练会话'):'登录后保存积分、题解与训练进度'}}</div></aside></div>
    <section class="home-stats"><article><span>训练任务</span><b>{{stats.totalChallenges}}</b><small>已在本地题库开放</small></article><article><span>有效提交</span><b>{{stats.totalSolves}}</b><small>平台累计正确解题</small></article><article><span>{{authenticated?'运行会话':'注册学员'}}</span><b>{{authenticated?range.metrics.activeSessions:stats.registeredUsers}}</b><small>{{authenticated?'当前账号的受控会话':'已建立学习档案'}}</small></article><article><span>练习材料</span><b>{{range.metrics.attachments}}</b><small>题目配套训练资源</small></article></section>
    <div class="home-main"><EventCalendar :authenticated="authenticated"/><aside class="home-side"><section class="activity-card announcement-card"><header><span class="eyebrow">通知公告</span><span>管理员发布</span></header><template v-if="announcements.length"><div v-for="notice in announcements.slice(0,4)" :key="notice.id" class="activity-line"><i></i><div><b>{{notice.title}}</b><p>{{notice.content}}</p><small>{{notice.author}}</small></div><time>{{new Date(notice.createdAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}}</time></div></template><p v-else class="quiet">暂无通知公告。</p></section><section class="rank-card"><header><span class="eyebrow">积分排行</span><RouterLink :to="authenticated?'/leaderboard':{path:'/login',query:{redirect:'/leaderboard'}}">查看全部</RouterLink></header><div v-for="user in ranking.slice(0,3)" :key="user.id" class="rank-line"><b>{{String(user.rank).padStart(2,'0')}}</b><span>{{user.username}}</span><small>{{user.score}} 分</small></div></section></aside></div>
  </section>
  <section v-else class="home-dashboard home-loading"><p v-if="error">{{error}}</p><p v-else>正在读取训练仪表盘…</p></section>
</template>
