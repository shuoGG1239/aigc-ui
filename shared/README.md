# shared/

Process-agnostic TypeScript used by **Electron main** and **web renderer**.

- Import as `@shared/<module>` (aliased in `electron.vite.config.ts` + tsconfigs).
- No Vue, DOM APIs, or Node/`electron` imports here.
- UI-only code stays under `web/src/`; Node/Electron I/O stays under `electron/main/`.

| Module | Role |
|--------|------|
| `ipc-types` | IPC contracts (`Txt2ImgParams`, `AppSettings`, …) |
| `family` | Model family resolve + sampling defaults |
| `limits` / `app-defaults` | Shared numeric / product constants |
| `txt2img-form` | `Txt2ImgForm` + `createDefaultForm` / `normalizeForm` |
| `lora-tag` | `<lora:>` parse / format |
| `prompt-pool-types` | Pool shape + normalize helpers |
| `program-pools` | Built-in programmatic pools |
| `prompt-preview` | Preview filename key normalize |
| `model-prompt-presets` | Quality / negative presets |
| `pick` / `prompt-tool` | Small prompt helpers |
