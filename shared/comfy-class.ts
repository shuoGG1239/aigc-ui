/** ComfyUI node `class_type` strings used by API workflows and metadata parsers. */

export const ComfyClass = {
  UNETLoader: 'UNETLoader',
  CLIPLoader: 'CLIPLoader',
  VAELoader: 'VAELoader',
  CheckpointLoaderSimple: 'CheckpointLoaderSimple',
  ModelSamplingAuraFlow: 'ModelSamplingAuraFlow',
  LoraLoader: 'LoraLoader',
  CLIPSetLastLayer: 'CLIPSetLastLayer',
  CLIPTextEncode: 'CLIPTextEncode',
  EmptyLatentImage: 'EmptyLatentImage',
  KSampler: 'KSampler',
  VAEDecode: 'VAEDecode',
  PreviewImage: 'PreviewImage',
  /** Still appears in older / external graphs when parsing PNG metadata. */
  SaveImage: 'SaveImage',
} as const

export type ComfyClassName = (typeof ComfyClass)[keyof typeof ComfyClass]
