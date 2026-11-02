<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from './api';
import type { TrainingTool } from '@cyberquest/shared';

type ToolItem = {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  platforms: string[];
  source: string;
  url: string;
  action: string;
  usagePath?: string;
  command?: string;
  recommended?: boolean;
};

const fallbackTools: ToolItem[] = [
  { id: 'cyberchef', name: 'CyberChef', icon: 'CF', category: '密码编码', description: '在浏览器中完成 Base64、十六进制、哈希、压缩与常见数据格式转换。', platforms: ['在线使用', '离线 ZIP'], source: 'GCHQ', url: 'https://gchq.github.io/CyberChef/', action: '打开官方工具', recommended: true },
  { id: 'burp', name: 'Burp Suite Community', icon: 'BP', category: 'Web 安全', description: '用于授权 Web 题目的 HTTP 代理、历史记录、Repeater 与 Decoder。', platforms: ['Windows', 'macOS', 'Linux'], source: 'PortSwigger', url: 'https://portswigger.net/burp/communitydownload', action: '前往官方下载', recommended: true },
  { id: 'wireshark', name: 'Wireshark', icon: 'WS', category: '流量分析', description: '查看 PCAP、协议字段、会话流与过滤结果，是网络类题目的基础工具。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Wireshark Foundation', url: 'https://www.wireshark.org/download.html', action: '前往官方下载', recommended: true },
  { id: 'nmap', name: 'Nmap', icon: 'NM', category: '网络工具', description: '面向已授权目标的端口与服务识别工具；练习时务必限定题目给出的范围。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Nmap Project', url: 'https://nmap.org/download.html', action: '前往官方下载' },
  { id: 'ghidra', name: 'Ghidra', icon: 'GH', category: '逆向工程', description: '多平台软件逆向工程套件，适合查看函数、字符串、交叉引用与反编译结果。', platforms: ['Windows', 'macOS', 'Linux'], source: 'NSA / GitHub', url: 'https://github.com/NationalSecurityAgency/ghidra/releases', action: '查看官方发布', recommended: true },
  { id: 'jadx', name: 'JADX', icon: 'JX', category: '逆向工程', description: '面向 APK、DEX、AAB 的命令行与图形化反编译工具，适合移动端题目。', platforms: ['Windows', 'macOS', 'Linux'], source: 'skylot / GitHub', url: 'https://github.com/skylot/jadx/releases', action: '查看官方发布' },
  { id: 'pwntools', name: 'pwntools', icon: 'PW', category: '二进制安全', description: '用于编写二进制题交互脚本、处理 ELF、字节序和受控进程通信。', platforms: ['Python', 'Linux 优先'], source: 'Gallopsled', url: 'https://docs.pwntools.com/en/dev/install.html', action: '查看安装文档', command: 'python3 -m pip install --upgrade pwntools', recommended: true },
  { id: 'hashcat', name: 'hashcat', icon: 'HC', category: '密码编码', description: '密码恢复与哈希验证工具；只处理题目提供或明确授权的数据。', platforms: ['Windows', 'Linux', 'macOS'], source: 'hashcat Project', url: 'https://hashcat.net/hashcat/', action: '前往官方网站' },
  { id: 'volatility', name: 'Volatility 3', icon: 'V3', category: '数字取证', description: '从授权的内存镜像中提取进程、模块、网络连接等数字取证信息。', platforms: ['Python', '跨平台'], source: 'Volatility Foundation', url: 'https://github.com/volatilityfoundation/volatility3/releases', action: '查看官方发布', command: 'python3 -m pip install volatility3' },
  { id: 'exiftool', name: 'ExifTool', icon: 'EX', category: '数字取证', description: '读取图片、文档、音视频等文件的元数据，适合隐写与取证前期检查。', platforms: ['Windows', 'macOS', 'Linux'], source: 'Phil Harvey', url: 'https://exiftool.org/', action: '前往官方下载' },
];

const tools = ref<ToolItem[]>(fallbackTools);

const categories = ['全部', 'Web 安全', '流量分析', '网络工具', '密码编码', '逆向工程', '二进制安全', '数字取证'];
const query = ref('');
const activeCategory = ref('全部');
const copiedId = ref('');

const filteredTools = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return tools.value.filter((tool) => {
    const categoryMatches = activeCategory.value === '全部' || tool.category === activeCategory.value;
    const text = `${tool.name} ${tool.category} ${tool.description} ${tool.platforms.join(' ')}`.toLowerCase();
    return categoryMatches && (!keyword || text.includes(keyword));
  });
});

const starterTools = computed(() => tools.value.filter((tool) => tool.recommended));

onMounted(async () => {
  try {
    const rows = await api<TrainingTool[]>('/tools');
    tools.value = rows.map((tool) => ({
      id: tool.id,
      name: tool.name,
      icon: tool.icon,
      category: tool.category,
      description: tool.description,
      platforms: tool.platforms,
      source: tool.source,
      url: tool.officialUrl,
      action: tool.actionLabel,
      command: tool.installCommand,
      recommended: tool.recommended,
      usagePath: tool.usagePath,
    }));
  } catch {
    tools.value = fallbackTools;
  }
});

function clearFilters() {
  query.value = '';
  activeCategory.value = '全部';
}

async function copyCommand(tool: ToolItem) {
  if (!tool.command) return;
  try {
    await navigator.clipboard.writeText(tool.command);
    copiedId.value = tool.id;
    window.setTimeout(() => {
      if (copiedId.value === tool.id) copiedId.value = '';
    }, 1600);
  } catch {
    copiedId.value = '';
  }
}
</script>

<template>
  <main class="tools-page">
    <section class="starter-kit" aria-label="推荐入门组合">
      <div class="starter-kit-title">
        <span>推荐入门组合</span>
        <strong>覆盖 Web、流量、逆向和二进制基础场景</strong>
      </div>
      <div class="starter-links">
        <a v-for="tool in starterTools" :key="tool.id" :href="tool.url" target="_blank" rel="noopener noreferrer">
          <span>{{ tool.icon }}</span>{{ tool.name }}<i>↗</i>
        </a>
      </div>
    </section>

    <section class="tools-controls">
      <label class="tools-search">
        <span>⌕</span>
        <b>检索工具</b>
        <input v-model="query" type="search" placeholder="输入工具名称、方向或用途" />
      </label>
      <div class="tools-result-count"><b>{{ filteredTools.length }}</b> / {{ tools.length }} 个结果</div>
      <button type="button" :disabled="!query && activeCategory === '全部'" @click="clearFilters">清除筛选</button>
    </section>

    <nav class="tools-tabs" aria-label="工具分类">
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        :class="{ active: activeCategory === category }"
        @click="activeCategory = category"
      >
        {{ category }}
      </button>
    </nav>

    <section v-if="filteredTools.length" class="tools-grid">
      <article v-for="tool in filteredTools" :key="tool.id" class="tool-card">
        <header>
          <span class="tool-icon">{{ tool.icon }}</span>
          <div>
            <small>{{ tool.category }}</small>
            <h2>{{ tool.name }}</h2>
          </div>
          <em v-if="tool.recommended">推荐</em>
        </header>
        <p>{{ tool.description }}</p>
        <div v-if="tool.usagePath" class="tool-usage-path"><span>使用路径</span><b>{{ tool.usagePath }}</b></div>
        <div class="tool-platforms">
          <span v-for="platform in tool.platforms" :key="platform">{{ platform }}</span>
        </div>
        <div v-if="tool.command" class="tool-command">
          <code>{{ tool.command }}</code>
          <button type="button" @click="copyCommand(tool)">{{ copiedId === tool.id ? '已复制' : '复制' }}</button>
        </div>
        <footer>
          <span><small>官方来源</small><b>{{ tool.source }}</b></span>
          <a v-if="tool.url" :href="tool.url" target="_blank" rel="noopener noreferrer">{{ tool.action }} <i>↗</i></a>
        </footer>
      </article>
    </section>

    <section v-else class="tools-empty">
      <strong>没有找到匹配的工具</strong>
      <p>换一个关键词，或清除当前分类后再试。</p>
      <button type="button" @click="clearFilters">查看全部工具</button>
    </section>

    <section class="tools-notice">
      <div><span>01</span><strong>从官网获取</strong><p>下载页全部指向工具官网或官方代码仓库。</p></div>
      <div><span>02</span><strong>核验版本</strong><p>安装前确认系统架构，并优先校验发布方提供的签名或哈希。</p></div>
      <div><span>03</span><strong>遵守授权边界</strong><p>扫描、代理和密码恢复工具仅用于题目环境或明确授权目标。</p></div>
    </section>
  </main>
</template>
