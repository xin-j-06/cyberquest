# CyberQuest 2.0 项目交接文档

最后更新：2026-09-13

## 最近更新摘要（2026-09-13）

- 首页左侧原“推荐下一步”已替换为赛事日历；个人中心已恢复并继续显示“继续训练”，日历不属于个人中心页面。
- 赛事日历读取管理员已发布赛事，支持月视图、日期选择、比赛/报名日期标记、实时赛事状态和当前日期安排列表。
- 日历备忘按账号保存在后端，支持新增、编辑和删除；接口为 `GET/POST /api/calendar/memos` 与 `PATCH/DELETE /api/calendar/memos/:id`，本地 JSON 与 Prisma 两套仓储均已实现。
- 管理侧栏在“题目管理”正下方新增“工具管理”，路由为 `/admin/tools`，保持管理员路由守卫和后端角色校验。
- 工具管理支持新增、编辑、发布/下架、删除、推荐、排序和搜索；可维护使用路径、官网下载地址、安装命令、适用平台、来源与用途说明。
- 学员端“常用工具”由静态目录改为读取 `GET /api/tools`；只返回已发布工具，推荐工具自动进入顶部入门组合。
- 新增工具接口 `GET/POST /api/admin/tools`、`PATCH/DELETE /api/admin/tools/:id`，以及 Prisma 模型 `TrainingTool` 和迁移 `20260913110000_add_training_tools`。
- 工具链路已通过真实 HTTP 验收：新增后学员端可见、下架后隐藏、删除成功，临时测试记录已清理；共享包、前端、后端、Prisma Client 和 Prisma 类型检查均通过。

## 此前更新摘要（2026-09-12）

- 注册账号统一由后端持久化，密码仅保存 Argon2 哈希；账号记录补充稳定 ID、角色、创建时间、更新时间和最后登录时间。
- 已完成 `/admin` 独立管理后台，使用专属左侧侧边栏和顶部管理栏，与学员端布局及路由隔离；普通学员访问会被前端守卫拦截，后端仍执行最终角色校验。
- 已完成管理员用户安全 CRUD API 与管理页面：`GET/POST /api/admin/users`、`GET/PATCH/DELETE /api/admin/users/:id`。支持创建、搜索、角色筛选、编辑和二次确认删除；当前管理员不能删除自己，响应不包含 `passwordHash`。
- 首页“近期活动”已替换为“通知公告”；已发布公告通过 `GET /api/announcements` 提供给学员端。
- 已完成管理员公告 CRUD API 与管理页面：`GET/POST /api/admin/announcements`、`PATCH/DELETE /api/admin/announcements/:id`，支持搜索、状态筛选、草稿、发布、下架、编辑和删除。
- 题目笔记已升级为后端单题多记录：后保存内容不会覆盖旧笔记，个人中心可打开详情弹窗并按 ID 删除。
- 登录请求不再携带旧 Token，失效会话会静默清理；访问令牌默认有效期调整为可配置的 12 小时。
- 英雄榜顶部宣传标题区已移除，页面直接呈现榜单内容。
- 管理概览会汇总账号、题目、解题和公告数据，并展示最近注册账号、最新公告与快捷操作。
- 管理后台新增统一“题目管理”工作区，包含题目 CRUD/上下架、靶场模板概览、知识能力关联和运行运维四个页签。
- 新增管理员题目接口 `GET/POST /api/admin/challenges`、`PATCH/DELETE /api/admin/challenges/:id` 和 `/diagnose`；Flag 只接收写入并按仓储策略哈希保存，管理响应不返回明文或哈希。
- 题目编辑器已支持维护官方题解摘要、核心原理与分步复现流程；步骤按“标题｜操作｜预期结果”结构化保存，学员端未通关消耗 20 积分解锁，通关后免费读取后台最新版本。
- 题目分类、难度、积分、标签、动态 Flag、靶场类型和有效期均可维护；列表展示通过率、错误提交量和可计算时的平均解题时间。Prisma 已新增对应持久化字段与迁移 `20260912143000_add_challenge_management_fields`。
- 新增 `GET /api/admin/labs` 与 `POST /api/admin/labs/:instanceId/stop`，管理员可查看最近靶场实例并强制停止异常运行实例。
- 题目存在提交、解题、笔记或靶场历史时禁止直接删除，需先下架，避免破坏学习档案。
- 学员端新增全局右侧“意见反馈”入口，可提交系统错误或优化建议并自动记录来源页面；数据写入本地 JSON 或 PostgreSQL，提交接口带用户级频率限制。
- 管理后台新增“意见反馈”收件箱，支持类型/状态筛选、详情查看、管理员处理备注以及待处理、处理中、已解决状态流转；普通学员访问管理接口返回 403。
- 顶部导航已在“相关赛事”后新增“技术论坛”；论坛支持分类筛选、搜索、热门主题、发布讨论、详情楼层回复，以及作者/管理员删除主题，主题与回复均由本地 JSON 或 PostgreSQL 持久化。
- 新增论坛接口 `GET/POST /api/forum/posts`、`GET/DELETE /api/forum/posts/:id` 和 `POST /api/forum/posts/:id/replies`；发帖与回复具有用户级频率限制，Prisma 迁移为 `20260912161000_add_forum`。

## 能力图谱（本轮更新）

- 能力图谱由自由摆放的虚线节点图改为三阶段推荐路线：基础入口、证据分析、底层进阶。
- 5 个真实后端能力节点分别展示能力说明、知识专题、等级、XP、完成状态与进度条。
- 选中节点后，右侧详情会展示经过专项编写的能力说明、可验证掌握标准、学习证据、工具用途、先修建议与推荐下一步，不再使用笼统的通用描述。
- 页面采用浅色分阶段学习路径和白色能力档案，节点按 Web、密码、网络、逆向、Pwn 使用独立强调色，并放大正文与进度信息。
- 登录后继续读取 `/api/users/me/skills` 的真实经验数据；未登录时保留完整的公开路线预览。
- “查看知识专题”会携带对应知识域参数进入独立学习中心，“进入题库”保留实战入口。
- 关键文件：`apps/web/src/SkillView.vue`、`apps/web/src/skill-path.css`、`apps/web/src/LearningView.vue`。

## 常用工具板块（本轮更新）

- 顶部导航中的“训练环境”已改为“常用工具”，新地址为 `/tools`；旧地址 `/range` 会自动跳转，避免历史链接失效。
- 页面不再展示训练会话和任务启动入口，改为 CTF 工具导航，支持关键词检索与方向筛选。
- 当前默认收录 CyberChef、Burp Suite Community、Wireshark、Nmap、Ghidra、JADX、pwntools、hashcat、Volatility 3 和 ExifTool；目录不再写死，管理员可持续维护。
- 下载入口仅指向项目官网、官方文档或官方 GitHub Releases，不在本站托管第三方安装包。
- pwntools 和 Volatility 3 提供可复制的安装命令；页面同时提示版本核验与授权使用边界。
- 管理端 `/admin/tools` 可配置工具用途、使用路径、适用平台、安装命令、官网入口、推荐状态与展示顺序；发布/下架状态决定学员端可见性。
- 关键文件：`apps/web/src/RangeView.vue`、`apps/web/src/AdminToolsView.vue`、`apps/web/src/tools.css`、`apps/web/src/admin-tools.css`、`apps/web/src/router.ts`、`apps/web/src/AdminLayout.vue`。

## 学习中心知识库（本轮更新）

- 学习中心已由 3 条简单课程目录重构为 CTF 知识库，包含 Web 安全、密码学、流量与取证、逆向工程、二进制安全、通用能力 6 个知识域。
- 当前提供 39 个专题及其细分知识点，支持知识域切换和当前知识域关键词检索。
- 学习中心是完全独立的知识大全，不读取靶场进度、不跳转题目；专题卡片展示摘要、知识点数量和建议阅读时长。
- 点击专题后通过学习中心 URL 查询参数进入独立文章视图，不使用弹窗，并支持浏览器前进、后退；文章采用连续文档布局，按学习目标、核心知识点、分析流程、工具速查和代码示例组织，右侧提供页内目录。
- 39 个知识专题均配置了独立的示例、工具说明和命令；学习目标、知识点检查项与分析流程会结合当前专题生成，不再按知识域复用同一套文章内容。
- 专题文章包含知识点大全、标准分析流程、代码与命令示例、对应工具使用说明；示例按六个知识域分别编排。
- 页面提供 CTF Wiki、Web Security Academy、picoCTF Resources 的扩展阅读入口。
- 关键文件：`apps/web/src/LearningView.vue`、`apps/web/src/learning-library.css`。

## 1. 当前状态

项目已具备可本地演示的完整 CTF 闭环：注册登录、训练总览、首页赛事日历与个人备忘、题库、题目工作台、独立靶场、动态 Flag、提交计分、官方题解、后端学习笔记、通知公告、能力图谱、学习中心、后端驱动的常用工具、相关赛事、技术论坛、个人中心和排行榜。

本轮完成的关键调整：

- 顶部导航已移除“攻击推演”，并在“学习中心”后加入“相关赛事”。
- 攻击推演路由、页面入口、服务端接口和共享类型均已移除。
- 题目工作台统一为左侧主操作区、右侧笔记/AI/题解/记录区，六道题共用同一套布局。
- “启动靶场”会逐条输出启动日志，随后显示真实可点击的网址。
- 靶场网址通过新标签页进入独立的 `/targets/:instanceId`。Web 题只显示虚构业务目标站，不显示平台导航、教学任务栏或返回按钮；Crypto、Network、Reverse、Pwn 则显示各自的材料分析/服务交互环境。旧 `/sandbox/:instanceId` 路由仅保留兼容访问。
- Web-101 通过参数越权读取内部记录；Web-102 通过修改未签名会话令牌访问管理控制台；Pwn 题通过安全的内存布局模拟器提交覆盖载荷。
- Crypto、Network、Reverse 题使用当前会话动态生成的编码消息、HTTP 流量和反编译材料，学员需自行分析并恢复 Flag。
- 六道题不再复用教学面板：两道 Web 题分别呈现 Northstar Directory 与 Legacy Portal；其余四题分别呈现 Relay Decoder、Packet Scope、Rev Studio 与 Pwnbox 独立界面。
- Flag 不再由选择题接口自动填入工作台；学员必须在靶场响应或材料中找到它，再返回工作台手动提交。
- 启动后的操作区显示“结束答题”；结束或到期后，独立靶场接口不可继续访问。
- 仅为确实依赖文件分析的 4 道题提供真实附件：编码 TXT、流量 CSV、逆向字符串清单、内存安全 C 源码；两个网页题不提供附件。

## 2. 技术结构

- 前端：Vue 3、Vue Router、Pinia、Vite。
- 后端：NestJS、DTO 校验、JWT、Socket.IO。
- 共享契约：`packages/shared`。
- 默认数据层：本地 JSON，文件为 `apps/server/data/cyberquest.local.json`。
- 可选数据层：Prisma + PostgreSQL，通过 `DATA_BACKEND=prisma` 切换。
- 本地默认端口：前端 `5173`，后端 `3000`；REST 前缀为 `/api`。

## 3. 解题链路

1. 工作台调用 `POST /api/labs/start`。
2. 后端创建归属于当前用户、当前题目且带有效期的会话，返回 `/targets/:instanceId`。
3. 独立页调用 `GET /api/labs/instances/:instanceId/target` 读取题目材料。此接口不会返回正确答案或 Flag。
4. 交互型题目向 `POST /api/labs/instances/:instanceId/interact` 发送参数、令牌或载荷；材料型题目在浏览器中下载会话材料分析。
5. 后端用 `LAB_FLAG_SECRET + challengeSlug + instanceId` 生成会话专属动态 Flag，并将其放入成功利用后的响应或可逆材料中。
6. 学员自行恢复/复制 Flag，返回工作台手动填写。
7. 工作台调用 `POST /api/challenges/:id/submit` 完成验证、计分和能力记录。
8. “结束答题”调用 `POST /api/labs/:id/stop`，随后目标读取和交互接口拒绝访问。

动态 Flag 不写入本地 JSON 或数据库明文字段。种子 Flag 仍只以服务端哈希保存。靶场交互接口限制为每个 IP、用户和实例每分钟 30 次。

## 4. 关键文件

- `apps/web/src/WorkspaceView.vue`：题目工作台、靶场启动日志、网址、结束答题和 Flag 提交。
- `apps/web/src/SandboxTargetView.vue`：独立 CTF 目标页与交互台。
- `apps/web/src/sandbox-target.css`：独立目标页样式。
- `apps/web/src/App.vue`：平台导航；沙箱路由下隐藏全站导航。
- `apps/web/src/ProfileView.vue`：个人中心，展示账号档案、积分、能力进度、最近完成和题目笔记；笔记可打开详情弹窗并按记录单独删除。
- `apps/web/src/challenge-notes.ts`：按笔记 ID 维护浏览器缓存，并兼容迁移旧版单题本地笔记；后端数据是事实来源。
- `apps/web/src/account.css`、`apps/web/src/theme.css`：账号菜单、个人中心和全站深浅主题样式。
- `apps/web/src/CompetitionsView.vue`：相关赛事板块。
- `apps/web/src/HomeView.vue`、`apps/web/src/EventCalendar.vue`、`apps/web/src/home.css`、`apps/web/src/home-calendar.css`：训练总览、首页赛事日历、账号备忘与通知公告展示。
- `apps/web/src/AdminToolsView.vue`、`apps/web/src/admin-tools.css`：管理员工具目录 CRUD、发布状态、使用路径和官网下载地址维护。
- `apps/web/src/RangeView.vue`、`apps/web/src/tools.css`：读取后端已发布工具的学员端常用工具页面。
- `apps/server/src/modules/lab-target.ts`：六道真实 CTF 场景、交互规则、动态材料和 Flag 生成。
- `apps/server/src/modules/challenge-attachments.ts`：附件白名单、元数据和安全路径解析。
- `apps/server/prisma/migrations/20260912094500_add_challenge_notes/migration.sql`、`20260912100500_allow_multiple_challenge_notes/migration.sql`：PostgreSQL 题目笔记表及单题多笔记迁移。
- `apps/server/assets/challenges/`：4 个真实训练附件。
- `apps/server/src/modules/local.controller.ts`：沙箱 REST 端点和频率限制。
- `apps/server/src/modules/local.store.ts`：本地 JSON 实现。
- `apps/server/src/modules/prisma-learning.repository.ts`：Prisma 实现。
- `apps/server/prisma/migrations/20260912113000_add_user_updated_at/migration.sql`：为持久化账号补充管理员管理所需的更新时间字段。
- `apps/server/prisma/migrations/20260912121000_add_announcements/migration.sql`：通知公告表，支持发布状态和管理员作者关联。
- `apps/server/prisma/migrations/20260912183000_add_calendar_memos/migration.sql`：当前账号赛事日历备忘录。
- `apps/server/prisma/migrations/20260913110000_add_training_tools/migration.sql`：后台维护的工具目录、发布状态和排序字段。
- `packages/shared/src/index.ts`：`LabSession`、`LabTarget`、`LabInteractionResult`、`CalendarMemo`、`TrainingTool` 等共享类型。
- `scripts/verify-local.mjs`：完整本地回归脚本。
- `docs/openapi.json`：REST API 契约。

题目笔记接口采用追加式记录：`POST /api/challenges/:id/notes` 每次创建新笔记，不覆盖同题旧记录；`GET /api/challenges/:id/notes` 查询单题记录，`GET /api/users/me/notes` 查询当前账号全部记录，`DELETE /api/users/me/notes/:noteId` 只删除指定记录。

## 5. 启动方式

在仓库根目录执行：

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

浏览器打开 `http://127.0.0.1:5173`。演示账号：

- 邮箱：`demo@cyberquest.local`
- 密码：`CyberQuest123!`

也可以分开运行：

```powershell
corepack pnpm --filter @cyberquest/server dev
corepack pnpm --filter @cyberquest/web dev
```

## 6. 环境变量

本地默认使用 `DATA_BACKEND=local`。正式环境必须提供三个互不相同的长随机值：

- `JWT_ACCESS_SECRET`
- `JWT_ACCESS_EXPIRES_IN`（默认 `12h`，可按部署策略覆盖）
- `ATTEMPT_HASH_SECRET`
- `LAB_FLAG_SECRET`

另有 `LAB_TTL_SECONDS` 控制沙箱有效期，默认 1800 秒。示例见根目录 `.env.example` 与 `apps/server/.env.example`。

## 7. 验收情况

截至 2026-09-13 已通过：

- `corepack pnpm build`
- `node scripts/verify-local.mjs`
- `docs/openapi.json` JSON 解析验证
- 独立靶场 URL 形态验证
- 六种靶场材料无明文 Flag 泄漏验证
- Web 普通请求不返回 Flag，参数越权后返回会话 Flag
- 会话令牌篡改与安全 Pwn 载荷能触发对应 Flag
- Crypto 双层编码、Network HTTP 载荷和 Reverse XOR 字节表均可恢复对应会话 Flag
- `/targets/:instanceId` 前端路由与 `/api/labs/instances/:instanceId/interact` 真实 HTTP 调用验证
- 动态 Flag 能在对应题目成功提交
- Flag 验证成功后自动调用后端结束并释放当前靶场会话，同时保留完整答题界面和持久成功提示；用户可以重新启动靶场继续复盘或重复提交
- 六道题均提供与实际靶场机制一致的独立官方题解（原理、三步流程、代码/请求示例和预期结果），未通关时整份题解统一消耗 20 积分解锁，通关后自动免费开放；接口不会向未解锁用户返回题解正文
- `scripts/verify-official-guides.mjs` 已在隔离临时数据后端完成六题端到端验收：按题解恢复六个动态会话 Flag、逐题提交成功、五次付费解锁均实际扣除 20 分，通关后免费开放验证通过
- 系统入口已增加全局登录守卫：未登录访问根地址或任意业务路由会先进入 `/login`，登录/注册成功后进入训练总览，退出登录后立即返回登录页
- 顶部“演示学员”已改为账号菜单，提供个人中心、深浅色模式切换和退出登录；主题偏好保存在当前浏览器并在刷新后恢复
- 登录会话不再回退读取旧版 `localStorage` Token，登录/注册请求不会携带已有 Token；失效会话会被统一静默清理并跳转登录页，不会在登录表单显示“访问令牌失效”，默认访问令牌有效期已由 15 分钟调整为可配置的 12 小时
- 注册账号始终写入后端：本地模式使用 `apps/server/data/cyberquest.local.json` 原子持久化，Prisma 模式写入 PostgreSQL；密码只保存 Argon2 哈希。已预留管理员安全 CRUD 接口 `GET /api/admin/users`、`GET/PATCH/DELETE /api/admin/users/:id`，普通用户访问返回 403，响应不会包含 `passwordHash`
- 首页“近期活动”已改为后端通知公告：学员通过 `GET /api/announcements` 只接收已发布公告；管理员可通过 `GET/POST /api/admin/announcements` 和 `PATCH/DELETE /api/admin/announcements/:id` 发布、修改、上下架和删除公告
- 公告权限与持久化验收通过：管理员发布的正式公告对学员可见，未发布草稿不可见，普通用户发布返回 403，服务重启后正式公告仍存在
- 题目笔记已改为按账号、按题目追加保存；同题可有多篇独立记录，个人中心点击列表项打开详情弹窗，右侧 `×` 可删除单篇记录，旧版缓存会去重迁移
- 个人中心已联调 `/api/users/me`、`/api/users/me/skills`、`/api/challenges` 和 `/api/range/overview`，可展示积分、完成数、能力方向与最近完成题目
- 题目笔记已升级为账号后端持久化：`GET /api/users/me/notes` 汇总个人笔记，`GET/POST /api/challenges/:id/notes` 查询或新增单题笔记，`DELETE /api/users/me/notes/:noteId` 删除指定记录；本地 JSON 与 Prisma/PostgreSQL 两套实现保持同一接口
- 已完成笔记持久化回归：同题连续新增不会覆盖、可按 ID 删除且不影响同题其他记录、重启后端内容仍存在、未登录访问返回 401；验收测试内容已清理
- 官方题解正文使用独立定高滚动容器，页签保持固定；桌面端和移动端均提供可见的自定义滚动轨道与滑块
- 附件数量按题目正确显示、未登录下载被拒绝、登录后可下载真实内容
- 私有 Socket.IO 事件与无效 Token 拒绝验证
- 首页原“推荐下一步”已替换为赛事日历，个人中心仍显示“继续训练”；日历可读取已发布赛事并按账号新增、编辑、删除备忘
- 工具管理真实 HTTP 链路验收通过：管理员新增后学员端可见、下架后隐藏、删除后移除，临时验收数据已清理
- `corepack pnpm --filter @cyberquest/shared build`、前后端生产构建、Prisma Client 生成、Prisma schema 校验与 `prisma:check` 均通过

## 8. 已知边界与后续建议

- 当前靶场是可交互的本地合成 CTF 目标，不启动真实易受攻击容器，也不连接外部目标；Pwn 为内存布局模拟，不执行任意本机代码。
- Prisma 路径已编译，但仍需在可用 PostgreSQL 环境中做真实集成测试和 migration。
- `/admin` 管理中心、用户管理、通知公告、题目管理、工具管理、赛事管理和意见反馈前端均已完成当前版本；后端仍对每个管理员接口执行角色校验，不能只依赖前端路由守卫。
- 工具官网地址由管理员维护，平台只提供导航，不镜像第三方安装包；正式上线前应建立链接定期巡检和来源审核流程。
- `docs/openapi.json` 尚未补录赛事、日历备忘、论坛、反馈和工具管理的新增接口，后续契约同步时需要一次性补齐。
- 题目笔记已按账号写入后端；浏览器本地仅保留离线缓存和旧数据迁移副本。
- 可继续为沙箱补充更多题型、分步证据、错误次数记录和完成用时统计。
- `apps/web/src/experience.css`、`styles.css` 中仍有少量历史页面的未使用样式，可在后续样式整理中删除，不影响当前页面。

## 9. Git 与交付约束

- 远程地址：`https://github.com/ll0210/L2.git`
- 当前分支：`main`；交付前应重新检查工作树状态，不能假设已有提交或远端同步状态。
- 用户已明确要求：只有再次明确说“同步仓库”时才提交或推送。本轮不得自行同步 GitHub。
- 不提交 `.env`、本地运行态 JSON、访问令牌或任何真实凭据。
