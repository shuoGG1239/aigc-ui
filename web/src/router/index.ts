import { createRouter, createWebHashHistory } from 'vue-router'
import Txt2ImgView from '@/views/Txt2ImgView.vue'
import ConsoleView from '@/views/ConsoleView.vue'
import SettingsView from '@/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'txt2img', component: Txt2ImgView },
    { path: '/console', name: 'console', component: ConsoleView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
