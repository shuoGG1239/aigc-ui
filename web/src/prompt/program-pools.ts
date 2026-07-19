/**
 * Closed programmatic pools. Externally: name in → prompt string out.
 * Listed in the pool UI as black boxes (no internals).
 * Some pools (`quality`, `neg`) adapt output to the active model family.
 */
import type { ModelFamily } from '../models/family'
import {
  presetNegativePrompt,
  presetQualityPrompt,
  type PromptPresetContext,
} from './model-prompt-presets'
import { randomOne } from './pick'
import { prettyPrompt } from './prompt-tool'

export type ProgramPoolContext = PromptPresetContext

type Slot = { prompts: string[]; chance: number }
/** `[prompts | prompt, chance?]` — chance defaults to 100. */
type SlotDef = [string | string[], number?]

function toSlots(defs: SlotDef[]): Slot[] {
  return defs.map(([raw, chance = 100]) => ({
    prompts: (Array.isArray(raw) ? raw : [raw]).map((s) => s.trim()).filter(Boolean),
    chance,
  }))
}

function rollChance(chance: number): boolean {
  if (chance >= 100) return true
  if (chance <= 0) return false
  return Math.floor(Math.random() * 101) < chance
}

function sampleSlots(slots: Slot[]): string {
  const picked: string[] = []
  for (const s of slots) {
    if (!s.prompts.length || !rollChance(s.chance)) continue
    const one = randomOne(s.prompts)
    if (one?.trim()) picked.push(one.trim())
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
  }
  return prettyPrompt(picked.join(','))
}

const VIEW = [
  'from_below',
  'from_side',
  'from_side_back',
  'from_above',
  'from_back',
  'from_behind',
  'upper_body',
  'close_up',
  'from_back',
  'pov',
  'on_back',
  'on_side',
  'on_stomach',
  'dynamic_angle',
  'looking_back',
  'pantyshot',
  'wide_shot',
  'cowboy_shot',
  'profile',
  'peeking',
]

const FOCUS = [
  'ass_focus',
  'breast_focus',
  'foot_focus',
  'pectoral_focus',
  'armpit_focus',
  'navel_focus',
  'thigh_focus',
  'hip_focus',
  'between_breasts',
  'between_legs',
]

const ACT_GRAB = [
  'all_fours',
  'stretch',
  'reaching',
  'restrained',
  'spread_arms',
  'arched_back',
  'armpits',
  'arms_up',
  'groping',
  'sitting',
  'standing',
  'spread legs',
  'legs_up',
  'hand_on_hip',
  'hand_on_ass',
  'hand on breasts',
  'hair_grab',
  'leg_grab',
  'penis_grab',
  'sheet_grab',
  'thigh_grab',
  'arm_grab',
  'wrist_grab',
  'torso_grab',
  'guided_crotch_grab',
  'belly_grab',
  'ankle_grab',
  'flat_grab',
  'tongue_grab',
  'tentacle_grab',
  'skirt_grab',
  'grabbing_own_thigh',
  'knee_grab',
  'breast_pull',
  'sock_pull',
  'thighhighs_pull',
  'socks_removed',
  'fingering',
  'Kabedon',
  'oral_invitation',
  'symmetrical_docking',
  'knee_up',
  'wariza',
  'straddling',
  'yokozuwari',
  'butterfly_sitting',
  'squatting',
  'kneeling',
  'all_fours',
  'soaking_feet',
  'feet_up',
  'crossed_ankles',
  'folded',
  'tiptoes',
  'toe-point',
  'carrying',
  'bathing',
  'leaning',
]

const ACT_DAILY = [
  'holding_cup',
  'holding_book',
  'holding_phone',
  'holding_umbrella',
  'holding_flower',
  'holding_camera',
  'holding_bag',
  'holding_pillow',
  'holding_gift',
  'adjusting_hair',
  'adjusting_clothes',
  'adjusting_eyewear',
  'adjusting_legwear',
  'adjusting_bra',
  'adjusting_panties',
  'leaning',
  'tying_hair',
  'v',
  'lifted_by_another',
  'sing',
  'reading',
  'tucking_hair',
  'hair_brushing',
  'wiping_tears',
  'shushing',
  'paw_pose',
  'twirling_hair',
  'wariza',
  'salute',
  'drawing',
  'playing_games',
  'praying',
  'waking_up',
  'yawning',
  'stroking_own_chin',
  'cheering',
]

const ACT_COMMON_MIX = [
  ...ACT_GRAB,
  'sing',
  'reading',
  'tucking_hair',
  'hair_brushing',
  'wiping_tears',
  'shushing',
  'paw_pose',
  'twirling_hair',
  'tying_hair',
  'v',
  'lifted_by_another',
  'salute',
  'drawing',
  'playing_games',
  'praying',
  'waking_up',
  'yawning',
  'stroking_own_chin',
  'cheering',
]

const REGISTRY = new Map<string, Slot[]>([
  [
    'act_common',
    toSlots([
      ['year_2023', 30],
      [
        [
          'socks',
          'pantyhose',
          'pantyhose',
          'pantyhose',
          'legwear',
          'thighhighs',
          'toeless_legwear',
          'kneehighs',
          'loose_socks',
          'frilled_legwear',
          'asymmetrical_legwear',
          'uneven_legwear',
        ],
        50,
      ],
      [
        [
          'serafuku',
          'vest',
          'camisole',
          'official',
          'swimsuit',
          'bikini',
          'kimono',
          'skirt',
          'dress',
          'heart_cutout',
          'nurse',
          'sportswear',
          'summer_uniform',
          'tutu',
          'lace_skirt',
          'bowtie',
          'wedding_dress',
        ],
        20,
      ],
      ['bra', 20],
      ['ass', 20],
      [
        [
          'simple_background',
          'border',
          'bathroom',
          'classroom',
          'outdoor',
          'indoor',
          'desk',
          'bed',
          'sofa',
          'sky',
          'beach',
          'chair',
        ],
        50,
      ],
      [VIEW, 50],
      [FOCUS, 20],
      ['nude', 10],
      ['nipple', 10],
      [['shoes', 'no_shoes', 'single_shoe'], 40],
      [['pussy', 'cameltoe', 'pussy_juice'], 10],
      [['medium_breasts', 'medium_breasts', 'small_breasts', 'big_breasts'], 20],
      ['fuck', 10],
      ['nsfw', 10],
      [ACT_COMMON_MIX, 80],
    ]),
  ],
  [
    'act_common2',
    toSlots([
      ['year_2023', 50],
      [['socks', 'pantyhose', 'legwear', 'thighhighs', 'kneehighs'], 50],
      ['bra', 20],
      [['simple_background', 'border'], 50],
      [VIEW, 60],
      ['no_shoes', 50],
      [ACT_GRAB, 30],
    ]),
  ],
  [
    'act_jk',
    toSlots([
      ['year_2023', 50],
      [
        [
          'socks',
          'pantyhose',
          'legwear',
          'thighhighs',
          'toeless_legwear',
          'kneehighs',
          'loose_socks',
          'frilled_legwear',
        ],
        50,
      ],
      [['serafuku', 'school_uniform']],
      [['simple_background', 'border', 'indoor', 'sky', 'outdoor'], 50],
      [VIEW, 50],
      [FOCUS, 50],
      [['shoes', 'no_shoes'], 30],
      [ACT_DAILY],
    ]),
  ],
])

type DynamicSampler = (ctx: ProgramPoolContext) => string

const DYNAMIC = new Map<string, DynamicSampler>([
  ['quality', (ctx) => presetQualityPrompt(ctx)],
  ['neg', (ctx) => presetNegativePrompt(ctx)],
])

/** Reserved names that must not be used by user/JSON pools. */
export function isProgramPoolName(name: string): boolean {
  const key = name.trim().toLowerCase()
  return REGISTRY.has(key) || DYNAMIC.has(key)
}

/** Names only — for listing. No internals. */
export function listProgramPoolNames(): string[] {
  return [...new Set([...REGISTRY.keys(), ...DYNAMIC.keys()])].sort((a, b) =>
    a.localeCompare(b),
  )
}

/** One opaque sample. Returns null if name is not a program pool. */
export function sampleProgramPool(
  name: string,
  ctx: ProgramPoolContext = { family: 'anima' },
): string | null {
  const key = name.trim().toLowerCase()
  const dyn = DYNAMIC.get(key)
  if (dyn) return prettyPrompt(dyn(ctx))
  const slots = REGISTRY.get(key)
  if (!slots) return null
  return sampleSlots(slots)
}
