# 前端结构

当前前端先按“状态在 App，展示在组件”的方式拆分。

## App.vue

`App.vue` 仍然是主控文件，负责：

- 学习状态机调度。
- LLM 调用。
- PDF 文件选择和渲染。
- 会话创建、命名和上下文打包。
- 用户输入、中断、恢复等核心动作。

后续可以继续把这些逻辑拆进 composables。

## components/

这些组件主要负责展示，不持有复杂业务状态。

- `SessionHeader.vue`：顶部会话名、新建会话、重命名、LLM 设置入口、模式显示。
- `MessageList.vue`：消息列表和 `<thinking>` 折叠展示。
- `QuestionPanel.vue`：当前题目和选项。
- `ComposerBar.vue`：输入框和发送/中断/恢复/取消按钮。
- `PdfPane.vue`：PDF 选择按钮、页面导航、PDF 页面列表。

## services/

服务层负责和外部能力交互。

- `llmConfig.ts`：LLM 配置读写。
- `openaiChat.ts`：OpenAI-compatible Chat Completions 调用。
- `pdfRenderer.ts`：用 pdf.js 渲染 PDF。
- `sessionPackage.ts`：把当前会话打包成 LLM 上下文。

## state/

- `learningStateMachine.ts`：学习流程状态机。

## types/

- `learning.ts`：学习、题目、会话相关类型。
- `pdf.ts`：PDF 文档和页面类型。

## 暂不使用事件总线

当前项目先不引入事件总线。组件通过 props 接收状态，通过 emits 把用户动作传回 `App.vue`。

这样数据流更直观：

```text
App.vue -> props -> component
component -> emits -> App.vue
```

等模块更多、跨模块事件变复杂时，再考虑事件总线或专门状态管理。
