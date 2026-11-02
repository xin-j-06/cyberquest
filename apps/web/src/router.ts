import { createRouter,createWebHistory } from 'vue-router';
import { LeaderboardView } from './views';
const ProfileView = () => import('./ProfileView.vue');
const LoginView = () => import('./LoginView.vue');
const AdminLoginView = () => import('./AdminLoginView.vue');
const HomeView = () => import('./HomeView.vue');
const WorkspaceView = () => import('./WorkspaceView.vue');
const ChallengesView = () => import('./ChallengesView.vue');
const RangeView = () => import('./RangeView.vue');
const SkillView = () => import('./SkillView.vue');
const LearningView = () => import('./LearningView.vue');
const CompetitionsView = () => import('./CompetitionsView.vue');
const ForumView = () => import('./ForumView.vue');
const SandboxTargetView = () => import('./SandboxTargetView.vue');
const AgentView = () => import('./AgentView.vue');
const AdminLayout = () => import('./AdminLayout.vue');
const AdminOverviewView = () => import('./AdminOverviewView.vue');
const AdminUsersView = () => import('./AdminUsersView.vue');
const AdminAnnouncementsView = () => import('./AdminAnnouncementsView.vue');
const AdminChallengesView = () => import('./AdminChallengesView.vue');
const AdminFeedbackView = () => import('./AdminFeedbackView.vue');
const AdminCompetitionsView = () => import('./AdminCompetitionsView.vue');
const AdminToolsView = () => import('./AdminToolsView.vue');
import { api, clearStoredSession } from './api';
import type { AuthUser } from '@cyberquest/shared';
const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:HomeView},{path:'/login',component:LoginView},{path:'/admin/login',component:AdminLoginView},{path:'/challenges',component:ChallengesView},{path:'/challenges/:id',component:WorkspaceView,props:true},{path:'/targets/:instanceId',component:SandboxTargetView,props:true},{path:'/sandbox/:instanceId',component:SandboxTargetView,props:true},{path:'/agent',component:AgentView},{path:'/tools',component:RangeView},{path:'/range',redirect:'/tools'},{path:'/skills',component:SkillView},{path:'/learning',component:LearningView},{path:'/competitions',component:CompetitionsView},{path:'/leaderboard',component:LeaderboardView},{path:'/profile',component:ProfileView},{path:'/admin',component:AdminLayout,meta:{requiresAdmin:true},children:[{path:'',redirect:'/admin/overview'},{path:'overview',component:AdminOverviewView,meta:{requiresAdmin:true,adminTitle:'管理概览',adminDescription:'掌握平台账号、题目、赛事与公告的最新状态。'}},{path:'challenges',component:AdminChallengesView,meta:{requiresAdmin:true,adminTitle:'题目管理',adminDescription:'维护 CTF 题目、靶场模板、知识关联与运行实例。'}},{path:'tools',component:AdminToolsView,meta:{requiresAdmin:true,adminTitle:'工具管理',adminDescription:'维护学员端工具的使用路径、安装方式与官方下载入口。'}},{path:'competitions',component:AdminCompetitionsView,meta:{requiresAdmin:true,adminTitle:'赛事管理',adminDescription:'创建、发布和维护学员端展示的赛事入口。'}},{path:'users',component:AdminUsersView,meta:{requiresAdmin:true,adminTitle:'用户管理',adminDescription:'管理平台注册账号、角色权限与成长数据。'}},{path:'announcements',component:AdminAnnouncementsView,meta:{requiresAdmin:true,adminTitle:'通知公告',adminDescription:'编辑并发布学员端可见的平台通知。'}},{path:'feedback',component:AdminFeedbackView,meta:{requiresAdmin:true,adminTitle:'意见反馈',adminDescription:'接收、跟进并闭环处理学员反馈。'}}]}]});

router.addRoute({ path: '/forum', component: ForumView });

router.beforeEach(async(to)=>{
  const token=sessionStorage.getItem('cq_token')??'';
  let authenticated=Boolean(token);
  if(token){
    try{
      const encoded=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const payload=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
      authenticated=typeof payload.exp==='number'&&payload.exp*1000>Date.now()+5000;
    }catch{ authenticated=false; }
    if(!authenticated) clearStoredSession();
  }
  const requiresAdmin=to.matched.some(record=>record.meta.requiresAdmin);
  if(!authenticated){
    if(requiresAdmin) return {path:'/admin/login',query:{redirect:to.fullPath}};
    if(!['/','/login','/admin/login'].includes(to.path)) return {path:'/login',query:{redirect:to.fullPath}};
  }
  let role='';
  if(authenticated){ try { role=JSON.parse(sessionStorage.getItem('cq_user')??'{}').role??''; } catch { role=''; } }
  if(authenticated&&role==='ADMIN'&&!requiresAdmin&&to.path!=='/admin/login') return '/admin/overview';
  if(requiresAdmin){
    if(role!=='ADMIN') return '/';
    try {
      const current=await api<AuthUser>('/users/me');
      if(current.role!=='ADMIN') return '/';
      sessionStorage.setItem('cq_user',JSON.stringify(current));
    } catch { return '/'; }
  }
  if(authenticated&&to.path==='/login') return role==='ADMIN'?'/admin/overview':'/';
  if(authenticated&&to.path==='/admin/login') return role==='ADMIN'?'/admin/overview':'/';
  return true;
});

export default router;
