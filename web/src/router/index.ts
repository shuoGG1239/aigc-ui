import { createRouter, createWebHashHistory } from 'vue-router'
import ConsoleView from '@/views/ConsoleView.vue'
import PromptPoolView from '@/views/PromptPoolView.vue'
import SettingsView from '@/views/SettingsView.vue'
import Txt2ImgView from '@/views/Txt2ImgView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'txt2img', component: Txt2ImgView },
    { path: '/pools', name: 'pools', component: PromptPoolView },
    { path: '/console', name: 'console', component: ConsoleView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
