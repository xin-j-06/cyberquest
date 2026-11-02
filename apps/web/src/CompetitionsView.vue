<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from './api'
import type { Competition, CompetitionCategory } from '@cyberquest/shared'

type Filter = 'ALL' | CompetitionCategory
const rows = ref<Competition[]>([])
const active = ref<Filter>('ALL')
const loading = ref(true)
const error = ref('')
const categories: { value: Filter; label: string }[] = [
  { value: 'ALL', label: '全部赛事' }, { value: 'INTERNATIONAL', label: '国际公开' },
  { value: 'DOMESTIC', label: '国内联赛' }, { value: 'UNIVERSITY', label: '高校竞赛' },
]
const categoryLabel: Record<CompetitionCategory, string> = { INTERNATIONAL: '国际公开', DOMESTIC: '国内联赛', UNIVERSITY: '高校竞赛' }
const categoryIcon: Record<CompetitionCategory, string> = { INTERNATIONAL: 'INT', DOMESTIC: 'CN', UNIVERSITY: 'EDU' }
const filtered = computed(() => active.value === 'ALL' ? rows.value : rows.value.filter(item => item.category === active.value))
const formatDay = (value?: string) => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value)) : ''
const schedule = (item: Competition) => {
  if (!item.startAt) return item.status
  const start = formatDay(item.startAt); const end = formatDay(item.endAt)
  return end && end !== start ? `${start} — ${end}` : start
}
async function load() {
  loading.value = true; error.value = ''
  try { rows.value = await api<Competition[]>('/competitions') }
  catch (reason: any) { error.value = reason.message || '赛事列表加载失败。' }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="page competition-page">
    <div class="competition-toolbar" aria-label="赛事分类">
      <div><button v-for="item in categories" :key="item.value" :class="{active:active===item.value}" @click="active=item.value">{{ item.label }}<small>{{ item.value==='ALL' ? rows.length : rows.filter(row=>row.category===item.value).length }}</small></button></div>
      <span>当前显示 <b>{{ filtered.length }}</b> 项</span>
    </div>
    <div v-if="error" class="competition-state error">{{ error }}<button @click="load">重新加载</button></div>
    <div v-else-if="loading" class="competition-state">正在同步赛事信息…</div>
    <div v-else-if="!filtered.length" class="competition-state">当前分类暂时没有已发布赛事。</div>
    <div v-else class="competition-grid">
      <a v-for="(item,index) in filtered" :key="item.id" :href="item.url" target="_blank" rel="noopener" class="competition-card" :class="[`tone-${item.category.toLowerCase()}`, {featured:item.featured}]">
        <div class="competition-card-index">{{String(index+1).padStart(2,'0')}}</div>
        <div class="competition-card-head"><i>{{ categoryIcon[item.category] }}</i><div><span>{{ categoryLabel[item.category] }}</span><small>{{ item.featured ? '平台推荐' : item.operator }}</small></div><em>{{ schedule(item) }}</em></div>
        <h2>{{ item.title }}</h2><p>{{ item.description }}</p>
        <div class="competition-tags"><i v-for="tag in item.tags" :key="tag">{{ tag }}</i></div>
        <footer><div><b>{{ item.operator }}</b><small>{{ item.scope }}</small></div><span>打开官方页面 <i>↗</i></span></footer>
      </a>
    </div>
    <div class="competition-source"><i></i><span>赛事信息由平台管理员维护；报名截止时间、参赛资格及规则请在主办方页面再次确认。</span><RouterLink to="/forum">去论坛交流参赛经验 →</RouterLink></div>
  </section>
</template>
