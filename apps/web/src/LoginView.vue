<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './stores/auth';

const router=useRouter(), route=useRoute(), auth=useAuth();
const mode=ref<'login'|'register'>('login');
const username=ref(''), email=ref(''), password=ref('');
const error=ref(''), submitting=ref(false), passwordLocked=ref(true);
const activeRuleField=ref<''|'username'|'password'>('');
const usernamePattern=/^[\p{L}\p{N}]+$/u;
const usernameChecks=computed(()=>[
  {label:'2–24 位字符',passed:username.value.length>=2&&username.value.length<=24},
  {label:'仅中英文或数字',passed:usernamePattern.test(username.value)},
]);
const passwordChecks=computed(()=>[
  {label:'至少 10 位',passed:password.value.length>=10&&password.value.length<=128},
  {label:'包含大小写字母',passed:/[a-z]/.test(password.value)&&/[A-Z]/.test(password.value)},
  {label:'包含数字和特殊字符',passed:/\d/.test(password.value)&&/[^A-Za-z0-9\s]/.test(password.value)},
  {label:'不含空格和账号信息',passed:Boolean(password.value)&&! /\s/.test(password.value)&&!passwordContainsIdentity.value},
]);
const passwordContainsIdentity=computed(()=>{
  const candidate=password.value.toLocaleLowerCase();
  const accountName=username.value.trim().toLocaleLowerCase();
  const emailPrefix=(email.value.trim().toLocaleLowerCase().split('@')[0]??'');
  return Boolean(candidate&&(accountName.length>=2&&candidate.includes(accountName)||emailPrefix.length>=3&&candidate.includes(emailPrefix)));
});
const registrationValid=computed(()=>usernameChecks.value.every(item=>item.passed)&&passwordChecks.value.every(item=>item.passed));
function switchMode(next: 'login'|'register'){
  mode.value=next;
  username.value='';
  email.value='';
  password.value='';
  passwordLocked.value=true;
  activeRuleField.value='';
  error.value='';
}
function unlockPassword(event: FocusEvent){
  activeRuleField.value='password';
  if(passwordLocked.value){
    password.value='';
    (event.target as HTMLInputElement).value='';
    passwordLocked.value=false;
  }
}
async function submit(){
  error.value='';
  if(mode.value==='register'&&!registrationValid.value){
    activeRuleField.value=usernameChecks.value.every(item=>item.passed)?'password':'username';
    error.value='请先满足用户名和密码的全部安全规则。';
    return;
  }
  submitting.value=true;
  try { if(mode.value==='login') await auth.login(email.value,password.value); else await auth.register({username:username.value,email:email.value,password:password.value}); const requested=typeof route.query.redirect==='string'?route.query.redirect:''; const fallback=auth.user?.role==='ADMIN'?'/admin/overview':'/'; const redirect=requested.startsWith('/')&&!requested.startsWith('//')?requested:fallback; await router.replace(redirect); }
  catch(e:any){ error.value=e.message||'操作未完成，请检查输入后重试。'; }
  finally { submitting.value=false; }
}
</script>

<template>
  <section class="login-page" aria-labelledby="login-page-title">
    <div class="login-side">
      <span class="login-kicker"><i></i> 赛博演武场 · 学员入口</span>
      <h1 id="login-page-title">把每一次<span>好奇</span><br>变成真正的能力</h1>
      <p class="login-intro">从一道题开始，记录每次尝试与成长。登录后继续你的训练，或创建属于自己的学习档案。</p>
      <div class="login-benefits">
        <div class="login-benefit"><b>01</b><span><strong>训练进度持续保存</strong><small>题目记录、笔记与积分集中管理。</small></span></div>
        <div class="login-benefit"><b>02</b><span><strong>围绕真实任务练习</strong><small>从题目、靶场到复盘，保持学习连续。</small></span></div>
      </div>
    </div>

    <form :class="['login-card',{'is-register':mode==='register'}]" autocomplete="off" @submit.prevent="submit">
      <div class="login-card-top"><span>CYBERQUEST ACCOUNT</span><RouterLink to="/">返回首页 <span aria-hidden="true">↗</span></RouterLink></div>
      <div class="tabs-login" aria-label="账户操作">
        <button type="button" :class="{active:mode==='login'}" :aria-pressed="mode==='login'" :disabled="submitting" @click="switchMode('login')">登录</button>
        <button type="button" :class="{active:mode==='register'}" :aria-pressed="mode==='register'" :disabled="submitting" @click="switchMode('register')">创建账户</button>
      </div>
      <div v-if="mode==='login'" class="login-form-heading">
        <h2>欢迎回来</h2>
        <p>输入你的账号信息，继续上次的训练。</p>
      </div>
      <div class="login-fields">
        <label v-if="mode==='register'"><span>用户名</span><input v-model.trim="username" name="username" autocomplete="username" required minlength="2" maxlength="24" placeholder="2-24 位中英文、数字" :aria-invalid="username.length>0&&!usernameChecks.every(item=>item.passed)" :aria-describedby="activeRuleField==='username'?'username-rules':undefined" @focus="activeRuleField='username'" @blur="activeRuleField=''" ></label>
        <ul v-if="mode==='register'&&activeRuleField==='username'" id="username-rules" class="credential-rules" aria-label="用户名安全要求">
          <li v-for="item in usernameChecks" :key="item.label" :class="{passed:item.passed}"><i aria-hidden="true">{{item.passed?'✓':'·'}}</i>{{item.label}}</li>
        </ul>
        <label><span>邮箱</span><input v-model.trim="email" name="email" autocomplete="off" required type="email" inputmode="email" placeholder="请输入邮箱地址"></label>
        <label><span>密码</span><input :key="mode" v-model="password" name="password" :autocomplete="mode==='login'?'current-password':'new-password'" :readonly="passwordLocked" required :minlength="mode==='register'?10:8" maxlength="128" type="password" :placeholder="mode==='register'?'设置高强度密码':'请输入密码'" :aria-invalid="mode==='register'&&password.length>0&&!passwordChecks.every(item=>item.passed)" :aria-describedby="mode==='register'&&activeRuleField==='password'?'password-rules':undefined" @focus="unlockPassword" @blur="activeRuleField=''"></label>
        <ul v-if="mode==='register'&&activeRuleField==='password'" id="password-rules" class="credential-rules password-rules" aria-label="密码安全要求">
          <li v-for="item in passwordChecks" :key="item.label" :class="{passed:item.passed}"><i aria-hidden="true">{{item.passed?'✓':'·'}}</i>{{item.label}}</li>
        </ul>
      </div>
      <p v-if="error" class="login-error" role="alert">{{error}}</p>
      <button class="login-submit" type="submit" :disabled="submitting">{{submitting?'正在处理…':mode==='login'?'登录并继续':'创建账户并开始'}}<span v-if="!submitting" aria-hidden="true">→</span></button>
    </form>
  </section>
</template>
