import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { applyStoredTheme } from './theme'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './styles/index.css'
import './styles/app.css'

applyStoredTheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
