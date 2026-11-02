import { createApp } from 'vue'; import { createPinia } from 'pinia'; import App from './App.vue'; import router from './router'; import { useAuth } from './stores/auth'; import { connectRealtime } from './realtime'; import './styles.css'; import './login.css'; import './catalog.css'; import './polish.css'; import './experience.css'; import './home.css'; import './workspace-editorial.css'; import './workspace-workbench.css'; import './competitions.css'; import './sandbox-target.css'; import './tools.css'; import './learning-library.css'; import './skill-path.css';
import './account.css'; import './home-calendar.css'; import './theme.css'; import './admin.css'; import './admin-login.css'; import './admin-feedback.css'; import './admin-competitions.css'; import './admin-tools.css'; import './feedback.css'; import './forum.css';
import './agent.css';
import './agent-enterprise.css';
import './workspace-agent.css';
const savedTheme=localStorage.getItem('cq_theme'); document.documentElement.dataset.theme=savedTheme==='dark'?'dark':'light';
const pinia = createPinia();
createApp(App).use(pinia).use(router).mount('#app');
const auth = useAuth(pinia);
if (auth.token) connectRealtime(auth.token);
let handlingExpiredSession=false;
window.addEventListener('cq:session-expired', async () => {
  if(handlingExpiredSession) return;
  handlingExpiredSession=true;
  auth.clearSession();
  try {
    const currentPath = router.currentRoute.value.path;
    const loginPath = currentPath.startsWith('/admin') ? '/admin/login' : '/login';
    if (currentPath !== loginPath) {
      await router.replace({ path: loginPath, query: { redirect: router.currentRoute.value.fullPath } });
    }
  } finally { handlingExpiredSession=false; }
});
