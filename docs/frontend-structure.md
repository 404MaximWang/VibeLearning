# 前端结构

当前前端按“`App.vue` 编排、composable 管领域逻辑、service 管外部能力、component 管展示”的方式组织。

## App.vue

`App.vue` 现在仍是主控文件，但职责已经收敛为装配层：

- 连接 `PdfPane`、`MessageList`、`QuestionPanel`、`ComposerBar`。
- 连接 `usePdfDocument`、`useLearningController`、`useSessionPersistence`。
- 负责少量顶层 UI 状态，例如 LLM 设置面板开关和 LLM 配置保存。

`App.vue` 不再自己实现完整的会话持久化、PDF 生命周期或 tutor/mock 执行细节。

## composables/

- `usePdfDocument.ts`：封装当前 PDF 文档、页面列表、标题/大小元数据、文件选择和 `pdf.js` 渲染。
- `useChatTranscript.ts`：封装消息数组、system/assistant/user 消息写入、`<thinking>` 解析、assistant 流式拼接，以及消息选中游标。
- `useLlmSettings.ts`：封装 LLM 配置加载、保存、重置、是否可用和设置面板状态。
- `useLearningController.ts`：封装学习状态机调度、消息流、题目选择、用户输入、会话重置/恢复、键盘交互，以及 tutor runtime 的编排。
- `useSessionPersistence.ts`：封装 `IndexedDB` 会话持久化、自动保存、会话搜索和恢复。`App.vue` 只消费它暴露出来的 `showSessions`、`storedSessions`、`sessionSearch` 和 `restoreStoredSession()`。

这种拆法的好处是：PDF、LLM 设置、学习控制器、会话存储都有自己的生命周期和 watch，不必继续挤在 `App.vue` 里。

## components/

这些组件主要负责展示，不持有复杂业务状态。

- `SessionHeader.vue`：顶部会话名、新建会话、历史会话入口、LLM 设置入口。
- `MessageList.vue`：消息列表、系统消息纯文本展示、`<thinking>` 折叠展示。
- `QuestionPanel.vue`：当前题目和选项。
- `ComposerBar.vue`：输入框和发送按钮。
- `PdfPane.vue`：PDF 选择按钮和页面纵向列表。
- `MarkdownContent.vue`：assistant/user 消息共用的 Markdown 渲染组件。

## services/

服务层负责和外部能力交互，或承载可复用的业务执行逻辑。

- `llmConfig.ts`：LLM 配置读写。
- `openaiChat.ts`：OpenAI-compatible Chat Completions 调用和流式 JSON 解析。
- `pdfRenderer.ts`：用 `pdf.js` 渲染 PDF，并返回每页 PNG data URL。它是 `usePdfDocument.ts` 的底层渲染服务。
- `sessionPackage.ts`：把当前会话打包成 LLM 上下文。
- `sessionStore.ts`：`IndexedDB` 数据库访问与会话搜索。
- `tutorRuntime.ts`：真实 LLM 路径和 mock tutor 路径的执行器。这里负责“怎么讲、怎么出题、怎么评价、怎么总结”，而不是由 `App.vue` 直接硬编码。

## state/

- `learningStateMachine.ts`：学习流程状态机。保持纯 reducer 风格，副作用在外层执行。

## types/

- `learning.ts`：学习、题目、会话相关类型。
- `pdf.ts`：PDF 文档和页面类型。

## 当前数据流

```text
App.vue -> props -> component
component -> emits -> App.vue

App.vue -> composables
useLearningController -> state machine
state machine -> effects
effects -> tutorRuntime / pdfRenderer / session persistence
```

## 暂不使用事件总线

当前项目仍然不引入事件总线。

原因不是事件总线一定不好，而是现在的数据流还足够清晰：

- 组件只通过 `props` 和 `emits` 通信。
- 会话存储已经抽到 composable。
- tutor 执行器已经抽到 service。

等后面真的出现“多个独立模块需要彼此广播”的情况，再考虑事件总线或更专门的状态管理。
