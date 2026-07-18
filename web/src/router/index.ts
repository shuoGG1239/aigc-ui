import { createRouter, createWebHashHistory } from 'vue-router'
import ConsoleView from '@/views/ConsoleView.vue'
import RollWorkflowView from '@/views/RollWorkflowView.vue'
import SettingsView from '@/views/SettingsView.vue'
import Txt2ImgView from '@/views/Txt2ImgView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'txt2img', component: Txt2ImgView },
    { path: '/roll', name: 'roll', component: RollWorkflowView },
    { path: '/console', name: 'console', component: ConsoleView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})
