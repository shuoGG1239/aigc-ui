import { spawn } from 'child_process'
import { existsSync } from 'fs'

/** Launch external image editor with the given file (detached). */
export function openImageWithEditor(imagePath: string, editorPath: string): void {
  const editor = editorPath.trim()
  const image = imagePath.trim()
  if (!editor) {
    throw new Error('未配置图片编辑软件')
  }
  if (!image) {
    throw new Error('图片路径为空')
  }
  if (!existsSync(editor)) {
    throw new Error('图片编辑软件不存在')
  }
  if (!existsSync(image)) {
    throw new Error('图片不存在')
  }
  const child = spawn(editor, [image], { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
}
