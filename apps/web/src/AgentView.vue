<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { api } from './api'
import { useAuth } from './stores/auth'

type AgentMessage = { id: string; role: 'assistant' | 'user'; content: string; provider?: string; feedback?: 'helpful' | 'unhelpful' | null; createdAt: string }
type AiStatus = { provider: string; model: string; configured: boolean; thinkingEnabled: boolean; reasoningEffort: string; mode: 'remote-model' | 'local-fallback' }
type AnswerBlock = { type: 'heading' | 'paragraph' | 'list' | 'code' | 'table'; content: string; marker?: string; headers?: string[]; rows?: string[][] }
type AiConversationSummary = { id: string; title: string; archived: boolean; messageCount: number; createdAt: string; updatedAt: string }
type AiConversationDetail = AiConversationSummary & { messages: AgentMessage[] }
type AiConversationChatResult = { conversation: AiConversationSummary; userMessage: AgentMessage; assistantMessage: AgentMessage }
type LearningMemory = { interests: string[]; goals: string[]; preferences: string[]; difficulties: string[]; interactionCount: number; updatedAt: string }

const auth = useAuth()
const question = ref('')
const sending = ref(false)
const error = ref('')
const messages = ref<AgentMessage[]>([])
const conversation = ref<HTMLElement>()
const sidebarOpen = ref(false)
const historyMenuOpen = ref(false)
const archiveOpen = ref(false)
const dialogMode = ref<'rename' | 'delete' | ''>('')
const titleDraft = ref('')
const actionNotice = ref('')
const conversations = ref<AiConversationSummary[]>([])
const archivedConversations = ref<AiConversationSummary[]>([])
const currentConversationId = ref('')
const conversationsLoading = ref(false)
const regeneratingMessageId = ref('')
const memoryPanelOpen = ref(false)
const memoryLoading = ref(false)
const memoryClearConfirm = ref(false)
const learningMemory = ref<LearningMemory>()
const aiStatus = ref<AiStatus>()
const currentTime = ref(new Date())
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let greetingTimer: ReturnType<typeof setInterval> | undefined

const currentConversation = computed(() => [...conversations.value, ...archivedConversations.value].find((item) => item.id === currentConversationId.value))
const conversationTitle = computed(() => currentConversation.value?.title || '新的学习对话')
const welcomeGreeting = computed(() => {
  const hour = currentTime.value.getHours()
  const period = hour >= 5 && hour < 11 ? '早上好' : hour >= 11 && hour < 18 ? '中午好' : '晚上好'
  return `${period}，${auth.user?.username?.trim() || '学员'}`
})
function conversationTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
function cleanInline(value: string) {
  return value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()
}

function tableCells(value: string) {
  return value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cleanInline(cell))
}

function isTableSeparator(value: string) {
  const cells = tableCells(value)
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function answerBlocks(content: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  let codeLines: string[] = []
  let inCode = false
  const lines = content.replace(/\r/g, '').split('\n')
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]
    const line = rawLine.trim()
    if (line.startsWith('```')) {
      if (inCode) { blocks.push({ type: 'code', content: codeLines.join('\n') }); codeLines = [] }
      inCode = !inCode
      continue
    }
    if (inCode) { codeLines.push(rawLine); continue }
    if (!line) continue
    if (line.includes('|') && lineIndex + 1 < lines.length && isTableSeparator(lines[lineIndex + 1])) {
      const headers = tableCells(line)
      const rows: string[][] = []
      lineIndex += 2
      while (lineIndex < lines.length && lines[lineIndex].trim().includes('|')) {
        const row = tableCells(lines[lineIndex])
        if (row.length !== headers.length) break
        rows.push(row)
        lineIndex += 1
      }
      lineIndex -= 1
      blocks.push({ type: 'table', content: '', headers, rows })
      continue
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) { blocks.push({ type: 'heading', content: cleanInline(heading[1]) }); continue }
    const numbered = line.match(/^(\d+)[.)、]\s*(.+)$/)
    if (numbered) { blocks.push({ type: 'list', marker: numbered[1], content: cleanInline(numbered[2]) }); continue }
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (bullet) { blocks.push({ type: 'list', marker: '•', content: cleanInline(bullet[1]) }); continue }
    blocks.push({ type: 'paragraph', content: cleanInline(line) })
  }
  if (codeLines.length) blocks.push({ type: 'code', content: codeLines.join('\n') })
  return blocks
}

async function loadConversations(openFirst = false) {
  conversationsLoading.value = true
  try {
    const [active, archived] = await Promise.all([
      api<AiConversationSummary[]>('/ai/conversations'),
      api<AiConversationSummary[]>('/ai/conversations/archived'),
    ])
    conversations.value = active
    archivedConversations.value = archived
    if (openFirst && !currentConversationId.value && active.length) await openConversation(active[0].id)
  } finally { conversationsLoading.value = false }
}

async function openConversation(id: string) {
  const detail = await api<AiConversationDetail>(`/ai/conversations/${id}`)
  currentConversationId.value = detail.id
  messages.value = detail.messages
  sidebarOpen.value = false
  historyMenuOpen.value = false
  await scrollToLatest()
}

function showNotice(message: string) {
  actionNotice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { actionNotice.value = '' }, 2600)
}

async function scrollToLatest() {
  await nextTick()
  conversation.value?.scrollTo({ top: conversation.value.scrollHeight, behavior: 'smooth' })
}

async function loadAiStatus() {
  try { aiStatus.value = await api<AiStatus>('/ai/status') } catch { aiStatus.value = undefined }
}

async function send(prompt?: string) {
  const content = (prompt ?? question.value).trim()
  if (!content || sending.value) return
  error.value = ''
  question.value = ''
  sidebarOpen.value = false
  const temporaryId = `pending-${crypto.randomUUID()}`
  sending.value = true
  try {
    if (!currentConversationId.value) {
      const created = await api<AiConversationSummary>('/ai/conversations', { method: 'POST', body: JSON.stringify({}) })
      currentConversationId.value = created.id
      conversations.value.unshift(created)
    }
    messages.value.push({ id: temporaryId, role: 'user', content, feedback: null, createdAt: new Date().toISOString() })
    await scrollToLatest()
    const response = await api<AiConversationChatResult>(`/ai/conversations/${currentConversationId.value}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: content, hintLevel: 1 }),
    })
    const pendingIndex = messages.value.findIndex((item) => item.id === temporaryId)
    if (pendingIndex >= 0) messages.value[pendingIndex] = response.userMessage
    messages.value.push(response.assistantMessage)
    const summaryIndex = conversations.value.findIndex((item) => item.id === response.conversation.id)
    if (summaryIndex >= 0) conversations.value.splice(summaryIndex, 1)
    conversations.value.unshift(response.conversation)
  } catch (reason: any) {
    error.value = reason.message || '智能体暂时无法回答，请稍后重试。'
    question.value = content
    if (currentConversationId.value) {
      try { await openConversation(currentConversationId.value) } catch { messages.value = messages.value.filter((item) => item.id !== temporaryId) }
    }
  } finally {
    sending.value = false
    await scrollToLatest()
  }
}

function clearConversation() {
  messages.value = []
  currentConversationId.value = ''
  error.value = ''
  historyMenuOpen.value = false
  sidebarOpen.value = false
}

function openRenameDialog() {
  titleDraft.value = conversationTitle.value
  dialogMode.value = 'rename'
  historyMenuOpen.value = false
  nextTick(() => (document.querySelector('.agent-dialog input') as HTMLInputElement | null)?.select())
}

function saveRenamedConversation() {
  const title = titleDraft.value.trim().slice(0, 40)
  if (!title) return
  if (!currentConversationId.value) return
  void api<AiConversationSummary>(`/ai/conversations/${currentConversationId.value}`, { method: 'PATCH', body: JSON.stringify({ title }) }).then((updated) => {
    const item = conversations.value.find((conversation) => conversation.id === updated.id) ?? archivedConversations.value.find((conversation) => conversation.id === updated.id)
    if (item) Object.assign(item, updated)
    dialogMode.value = ''
    showNotice('对话已重命名')
  }).catch((reason: any) => { error.value = reason.message || '重命名失败，请稍后重试。' })
}

function requestDeleteConversation() {
  dialogMode.value = 'delete'
  historyMenuOpen.value = false
}

async function confirmDeleteConversation() {
  if (!currentConversationId.value) return
  await api(`/ai/conversations/${currentConversationId.value}`, { method: 'DELETE' })
  const deletedId = currentConversationId.value
  conversations.value = conversations.value.filter((item) => item.id !== deletedId)
  archivedConversations.value = archivedConversations.value.filter((item) => item.id !== deletedId)
  clearConversation()
  dialogMode.value = ''
  showNotice('对话已删除')
}

async function archiveConversation() {
  if (!currentConversationId.value) return
  const archived = await api<AiConversationSummary>(`/ai/conversations/${currentConversationId.value}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
  conversations.value = conversations.value.filter((item) => item.id !== archived.id)
  archivedConversations.value.unshift(archived)
  clearConversation()
  archiveOpen.value = true
  showNotice('对话已归档')
}

async function restoreArchivedConversation(item: AiConversationSummary) {
  const restored = await api<AiConversationSummary>(`/ai/conversations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })
  archivedConversations.value = archivedConversations.value.filter((archive) => archive.id !== item.id)
  conversations.value.unshift(restored)
  await openConversation(item.id)
  archiveOpen.value = false
  showNotice('对话已恢复')
}

async function copyAnswer(message: AgentMessage) {
  try { await navigator.clipboard.writeText(message.content); showNotice('回答已复制') }
  catch { showNotice('复制失败，请手动选择文本') }
}

async function rateAnswer(message: AgentMessage, feedback: 'helpful' | 'unhelpful') {
  if (!currentConversationId.value) return
  const next = message.feedback === feedback ? null : feedback
  await api(`/ai/conversations/${currentConversationId.value}/messages/${message.id}/feedback`, { method: 'PATCH', body: JSON.stringify({ feedback: next }) })
  message.feedback = next
  showNotice(next ? '感谢你的反馈' : '已撤销反馈')
}

async function regenerateAnswer(message: AgentMessage) {
  if (!currentConversationId.value || regeneratingMessageId.value) return
  regeneratingMessageId.value = message.id
  error.value = ''
  try {
    const updated = await api<AgentMessage>(`/ai/conversations/${currentConversationId.value}/messages/${message.id}/regenerate`, { method: 'POST', body: JSON.stringify({}) })
    const index = messages.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) messages.value[index] = updated
    showNotice('已重新生成回答')
  } catch (reason: any) { error.value = reason.message || '重新生成失败，请稍后重试。' }
  finally { regeneratingMessageId.value = '' }
}

async function shareConversation() {
  historyMenuOpen.value = false
  const transcript = messages.value.map((message) => `${message.role === 'user' ? '我' : 'CyberQuest 智能体'}：\n${message.content}`).join('\n\n')
  const text = `${conversationTitle.value}\n\n${transcript}`
  try {
    if (navigator.share) {
      await navigator.share({ title: conversationTitle.value, text })
      showNotice('已打开系统分享面板')
    } else {
      await navigator.clipboard.writeText(text)
      showNotice('完整对话已复制')
    }
  } catch (reason: any) {
    if (reason?.name !== 'AbortError') {
      try { await navigator.clipboard.writeText(text); showNotice('完整对话已复制') }
      catch { showNotice('暂时无法分享，请稍后重试') }
    }
  }
}

async function openMemoryPanel() {
  memoryPanelOpen.value = true
  memoryClearConfirm.value = false
  memoryLoading.value = true
  try { learningMemory.value = await api<LearningMemory>('/ai/memory') }
  catch { learningMemory.value = undefined }
  finally { memoryLoading.value = false }
}

async function clearLearningMemory() {
  if (!memoryClearConfirm.value) { memoryClearConfirm.value = true; return }
  memoryLoading.value = true
  try {
    await api('/ai/memory', { method: 'DELETE' })
    learningMemory.value = { interests: [], goals: [], preferences: [], difficulties: [], interactionCount: 0, updatedAt: new Date(0).toISOString() }
    memoryClearConfirm.value = false
    showNotice('深度记忆已清除')
  } finally { memoryLoading.value = false }
}

function handleHistoryOutside(event: MouseEvent) {
  if (!(event.target as HTMLElement)?.closest('.agent-history-menu-wrap')) historyMenuOpen.value = false
}

function handleAgentEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  historyMenuOpen.value = false
  dialogMode.value = ''
  memoryPanelOpen.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
}

onMounted(async () => {
  document.addEventListener('click', handleHistoryOutside)
  document.addEventListener('keydown', handleAgentEscape)
  greetingTimer = setInterval(() => { currentTime.value = new Date() }, 60_000)
  await Promise.all([loadAiStatus(), loadConversations(false)])
  await scrollToLatest()
})
onUnmounted(() => {
  document.removeEventListener('click', handleHistoryOutside)
  document.removeEventListener('keydown', handleAgentEscape)
  if (noticeTimer) clearTimeout(noticeTimer)
  if (greetingTimer) clearInterval(greetingTimer)
})
</script>

<template>
  <section class="agent-app">
    <button class="agent-mobile-menu" aria-label="打开会话栏" @click="sidebarOpen=!sidebarOpen">☰</button>
    <div v-if="sidebarOpen" class="agent-sidebar-mask" @click="sidebarOpen=false"></div>

    <aside :class="['agent-chat-sidebar',{open:sidebarOpen}]">
      <div class="agent-side-brand"><i>✦</i><span><b>AI 智能体</b><small>CYBERQUEST AGENT</small></span></div>
      <button class="agent-new-chat" @click="clearConversation"><span>＋</span> 新对话</button>

      <section class="agent-history">
        <label>最近</label>
        <p v-if="conversationsLoading" class="agent-history-empty">正在同步对话…</p>
        <p v-else-if="!conversations.length" class="agent-history-empty">还没有学习对话</p>
        <div v-for="item in conversations" :key="item.id" :class="['agent-history-row',{active:item.id===currentConversationId}]">
          <button class="agent-history-open" @click="openConversation(item.id)"><i>◫</i><span><b>{{ item.title }}</b><small>{{ conversationTime(item.updatedAt) }} · {{ item.messageCount }} 条消息</small></span></button>
          <div v-if="item.id===currentConversationId" class="agent-history-menu-wrap">
            <button class="agent-history-more" aria-label="打开对话菜单" :aria-expanded="historyMenuOpen" @click.stop="historyMenuOpen=!historyMenuOpen">•••</button>
            <div v-if="historyMenuOpen" class="agent-history-menu" role="menu">
              <button role="menuitem" @click="shareConversation"><i>↗</i><span>分享</span></button>
              <button role="menuitem" @click="openRenameDialog"><i>✎</i><span>重命名</span></button>
              <button role="menuitem" @click="archiveConversation"><i>⌄</i><span>归档</span></button>
              <button class="danger" role="menuitem" @click="requestDeleteConversation"><i>×</i><span>删除</span></button>
            </div>
          </div>
        </div>
        <p v-if="actionNotice" class="agent-history-notice">{{ actionNotice }}</p>
      </section>

      <section v-if="archivedConversations.length" class="agent-archives">
        <button class="agent-archives-toggle" :aria-expanded="archiveOpen" @click="archiveOpen=!archiveOpen"><span>已归档</span><em>{{ archivedConversations.length }}</em><i>{{ archiveOpen ? '⌃' : '⌄' }}</i></button>
        <div v-if="archiveOpen" class="agent-archives-list">
          <button v-for="item in archivedConversations" :key="item.id" @click="restoreArchivedConversation(item)"><i>↶</i><span>{{ item.title }}</span><small>恢复</small></button>
        </div>
      </section>

      <div class="agent-side-spacer"></div>
      <div class="agent-side-user"><i>{{ auth.user?.username?.slice(0,1) || '学' }}</i><span><b>{{ auth.user?.username }}</b><small>Lv.{{ auth.user?.level }} · {{ auth.user?.score }} 积分</small></span></div>
    </aside>

    <main :class="['agent-chat-main',{empty:!messages.length}]">
      <header class="agent-model-bar">
        <button class="agent-mobile-menu-inline" @click="sidebarOpen=true">☰</button>
        <div><b>CyberQuest AI 助学中心</b></div>
        <div class="agent-header-status">
          <strong v-if="aiStatus?.configured && aiStatus.thinkingEnabled" class="agent-reasoning-badge">深度思考</strong>
          <button class="agent-memory-status" @click="openMemoryPanel"><i>◎</i>深度记忆</button>
          <span v-if="!aiStatus?.configured" class="agent-online offline"><i></i>本地模式</span>
        </div>
      </header>

      <div ref="conversation" class="agent-chat-scroll">
        <section v-if="!messages.length" class="agent-welcome">
          <div class="agent-welcome-logo">✦</div>
          <h1>{{ welcomeGreeting }}</h1>
          <p>知识答疑、课程辅导与学习规划</p>
        </section>

        <section v-else class="agent-thread">
          <article v-for="message in messages" :key="message.id" :class="['agent-thread-message',message.role]">
            <div v-if="message.role==='assistant'" class="agent-thread-avatar">✦</div>
            <div class="agent-thread-content">
              <b v-if="message.role==='assistant'">CyberQuest 智能体</b>
              <div v-if="message.role==='assistant'" class="agent-answer-content">
                <template v-for="(block,index) in answerBlocks(message.content)" :key="`${message.id}-${index}`">
                  <h3 v-if="block.type==='heading'">{{ block.content }}</h3>
                  <div v-else-if="block.type==='list'" class="agent-answer-list"><i>{{ block.marker }}</i><span>{{ block.content }}</span></div>
                  <pre v-else-if="block.type==='code'"><code>{{ block.content }}</code></pre>
                  <div v-else-if="block.type==='table'" class="agent-answer-table-wrap"><table><thead><tr><th v-for="(cell,cellIndex) in block.headers" :key="`h-${cellIndex}`">{{ cell }}</th></tr></thead><tbody><tr v-for="(row,rowIndex) in block.rows" :key="`r-${rowIndex}`"><td v-for="(cell,cellIndex) in row" :key="`c-${rowIndex}-${cellIndex}`">{{ cell }}</td></tr></tbody></table></div>
                  <p v-else>{{ block.content }}</p>
                </template>
              </div>
              <p v-else>{{ message.content }}</p>
              <div v-if="message.role==='assistant'" class="agent-message-actions" aria-label="回答操作">
                <button type="button" title="复制回答" @click="copyAnswer(message)"><span>▣</span>复制</button>
                <button type="button" title="重新生成回答" :disabled="Boolean(regeneratingMessageId)" @click="regenerateAnswer(message)"><span>↻</span>{{ regeneratingMessageId===message.id ? '生成中' : '重新回答' }}</button>
                <button type="button" title="回答有帮助" :class="{active:message.feedback==='helpful'}" @click="rateAnswer(message,'helpful')"><span>↑</span>有帮助</button>
                <button type="button" title="回答需要改进" :class="{active:message.feedback==='unhelpful'}" @click="rateAnswer(message,'unhelpful')"><span>↓</span>需改进</button>
              </div>
            </div>
          </article>
          <article v-if="sending" class="agent-thread-message assistant"><div class="agent-thread-avatar">✦</div><div class="agent-thread-content"><b>CyberQuest 智能体</b><div class="agent-thinking-panel"><span><i></i><i></i><i></i></span><div><b>{{ aiStatus?.configured && aiStatus.thinkingEnabled ? '正在深度思考' : '正在组织回答' }}</b><small>理解问题、核对上下文并生成安全回答</small></div></div></div></article>
        </section>
      </div>

      <div v-if="!messages.length" class="agent-empty-dock">
        <div v-if="error" class="agent-chat-error">{{ error }}</div>
        <div class="agent-empty-composer">
          <textarea v-model="question" maxlength="1000" rows="2" placeholder="向 CyberQuest 智能体提问" @keydown="handleKeydown"></textarea>
          <div class="agent-input-tools">
            <span class="agent-auto-skill"><i>◎</i>智能技能自动匹配</span>
            <small>{{ question.length }}/1000</small>
            <button :disabled="sending || !question.trim()" aria-label="发送消息" @click="send()">↑</button>
          </div>
        </div>
        <p>AI 可能会犯错，请核查重要信息；仅用于课程学习与授权环境。</p>
      </div>

      <div v-else class="agent-input-dock">
        <div v-if="error" class="agent-chat-error">{{ error }}</div>
        <div class="agent-chat-input">
          <textarea v-model="question" maxlength="1000" rows="2" placeholder="给 CyberQuest 智能体发送消息" @keydown="handleKeydown"></textarea>
          <div class="agent-input-tools">
            <span class="agent-auto-skill"><i>◎</i>智能技能自动匹配</span>
            <small>{{ question.length }}/1000</small>
            <button :disabled="sending || !question.trim()" aria-label="发送消息" @click="send()">↑</button>
          </div>
        </div>
        <p>AI 可能会犯错，请核查重要信息；仅在课程材料和授权环境中操作。</p>
      </div>
    </main>

    <div v-if="dialogMode" class="agent-dialog-backdrop" @mousedown.self="dialogMode=''">
      <form v-if="dialogMode==='rename'" class="agent-dialog" @submit.prevent="saveRenamedConversation">
        <h2>重命名对话</h2>
        <p>使用简短标题，之后会更容易找到这段对话。</p>
        <input v-model="titleDraft" maxlength="40" aria-label="对话名称">
        <footer><button type="button" @click="dialogMode=''">取消</button><button type="submit" :disabled="!titleDraft.trim()">保存</button></footer>
      </form>
      <section v-else class="agent-dialog agent-dialog-delete">
        <h2>删除这段对话？</h2>
        <p>删除后无法恢复。若只是暂时不想显示，可以选择归档。</p>
        <footer><button type="button" @click="dialogMode=''">取消</button><button class="danger" type="button" @click="confirmDeleteConversation">删除</button></footer>
      </section>
    </div>

    <div v-if="memoryPanelOpen" class="agent-dialog-backdrop" @mousedown.self="memoryPanelOpen=false">
      <section class="agent-dialog agent-memory-dialog">
        <header><div><span>PERSONAL LEARNING MEMORY</span><h2>深度记忆</h2></div><button aria-label="关闭深度记忆" @click="memoryPanelOpen=false">×</button></header>
        <div v-if="memoryLoading" class="agent-memory-loading">正在读取记忆…</div>
        <div v-else-if="learningMemory && learningMemory.interactionCount" class="agent-memory-groups">
          <section v-if="learningMemory.interests.length"><label>学习方向</label><div><span v-for="item in learningMemory.interests" :key="item">{{ item }}</span></div></section>
          <section v-if="learningMemory.goals.length"><label>学习目标</label><ul><li v-for="item in learningMemory.goals" :key="item">{{ item }}</li></ul></section>
          <section v-if="learningMemory.preferences.length"><label>回答偏好</label><div><span v-for="item in learningMemory.preferences" :key="item">{{ item }}</span></div></section>
          <section v-if="learningMemory.difficulties.length"><label>近期困难</label><ul><li v-for="item in learningMemory.difficulties" :key="item">{{ item }}</li></ul></section>
          <small>已从 {{ learningMemory.interactionCount }} 次学习互动中形成记忆</small>
        </div>
        <div v-else class="agent-memory-empty"><i>◎</i><b>还没有形成学习记忆</b><span>继续提问后，智能体会逐步了解你的学习方向和偏好。</span></div>
        <footer><button class="danger-outline" :disabled="memoryLoading || !learningMemory?.interactionCount" @click="clearLearningMemory">{{ memoryClearConfirm ? '再次点击确认清除' : '清除记忆' }}</button><button type="button" @click="memoryPanelOpen=false">完成</button></footer>
      </section>
    </div>
  </section>
</template>
