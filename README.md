# AIGC UI

ComfyUI Anima txt2img 桌面客户端（Electron + Vue 3）。

## 前置条件

1. 已安装 [Node.js](https://nodejs.org/) 18+
2. 本机已启动 ComfyUI，默认地址：`http://127.0.0.1:8188`
3. ComfyUI 中已放置 Anima 相关模型（与 `txt2img.py` 一致）：
   - UNET: `anima-base-v1.0.safetensors`
   - CLIP: `qwen_3_06b_base.safetensors`
   - VAE: `qwen_image_vae.safetensors`

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

产物在 `out/`（main / preload / renderer）。

## 使用

1. 侧栏「设置」：配置 ComfyUI 服务地址与生图输出目录
2. 侧栏「控制台」：填写启动命令，启动 / 停止 ComfyUI 并查看日志
3. 「文生图」生成；结果预览并自动保存

模型相关字段默认收起在「高级 · 模型预设」中，可按需展开修改。

## 参考

- [`txt2img.py`](txt2img.py)：命令行脚本，客户端工作流与其对齐
- [`docs/comfyui-openapi.yaml`](docs/comfyui-openapi.yaml)：ComfyUI 本地 API OpenAPI 定义（来自 [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI/blob/master/openapi.yaml)）
