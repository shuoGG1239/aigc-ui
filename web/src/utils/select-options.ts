export interface SelectOption {
  label: string
  value: string
}

export const SAMPLER_OPTIONS: SelectOption[] = [
  { label: 'er_sde', value: 'er_sde' },
  { label: 'euler', value: 'euler' },
  { label: 'euler_ancestral', value: 'euler_ancestral' },
  { label: 'heun', value: 'heun' },
  { label: 'dpm_2', value: 'dpm_2' },
  { label: 'dpm_2_ancestral', value: 'dpm_2_ancestral' },
  { label: 'lms', value: 'lms' },
  { label: 'dpm_fast', value: 'dpm_fast' },
  { label: 'dpm_adaptive', value: 'dpm_adaptive' },
  { label: 'dpmpp_2s_ancestral', value: 'dpmpp_2s_ancestral' },
  { label: 'dpmpp_sde', value: 'dpmpp_sde' },
  { label: 'dpmpp_sde_gpu', value: 'dpmpp_sde_gpu' },
  { label: 'dpmpp_2m', value: 'dpmpp_2m' },
  { label: 'dpmpp_2m_sde', value: 'dpmpp_2m_sde' },
  { label: 'dpmpp_2m_sde_gpu', value: 'dpmpp_2m_sde_gpu' },
  { label: 'dpmpp_3m_sde', value: 'dpmpp_3m_sde' },
  { label: 'dpmpp_3m_sde_gpu', value: 'dpmpp_3m_sde_gpu' },
  { label: 'ddim', value: 'ddim' },
  { label: 'uni_pc', value: 'uni_pc' },
  { label: 'uni_pc_bh2', value: 'uni_pc_bh2' },
]

/** ComfyUI KSampler scheduler values (single source for UI + meta normalize). */
export const COMFY_SCHEDULERS = [
  'simple',
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'ddim_uniform',
  'beta',
  'linear_quadratic',
  'kl_optimal',
] as const

export type ComfyScheduler = (typeof COMFY_SCHEDULERS)[number]

export const SCHEDULER_OPTIONS: SelectOption[] = COMFY_SCHEDULERS.map((value) => ({
  label: value,
  value,
}))

export const CLIP_TYPE_OPTIONS: SelectOption[] = [
  { label: 'stable_diffusion', value: 'stable_diffusion' },
  { label: 'stable_cascade', value: 'stable_cascade' },
  { label: 'sd3', value: 'sd3' },
  { label: 'stable_audio', value: 'stable_audio' },
  { label: 'mochi', value: 'mochi' },
  { label: 'ltxv', value: 'ltxv' },
  { label: 'pixart', value: 'pixart' },
  { label: 'cosmos', value: 'cosmos' },
  { label: 'lumina2', value: 'lumina2' },
  { label: 'wan', value: 'wan' },
  { label: 'hidream', value: 'hidream' },
  { label: 'chroma', value: 'chroma' },
  { label: 'ace', value: 'ace' },
]

export const WEIGHT_DTYPE_OPTIONS: SelectOption[] = [
  { label: 'default', value: 'default' },
  { label: 'fp8_e4m3fn', value: 'fp8_e4m3fn' },
  { label: 'fp8_e4m3fn_fast', value: 'fp8_e4m3fn_fast' },
  { label: 'fp8_e5m2', value: 'fp8_e5m2' },
]
