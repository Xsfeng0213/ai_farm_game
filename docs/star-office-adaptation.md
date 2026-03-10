# star-office-ui-v2 参考分析（面向真人联机空间游戏）

## 可借鉴部分
- Phaser 场景化组织：入口清晰，`Scene + Manager + Types` 分层明确。
- 角色类封装：把渲染、动作、对话气泡放到实体类，场景只做编排。
- 实时同步链路：网络事件统一入口，连接状态、消息分发、重连策略独立。
- 状态驱动表现：状态不是散落在 if 中，而是统一映射到动作和 UI 文案。
- 常量与类型集中管理：场景坐标、状态枚举、协议类型可维护性高。

## 可复用思路模块
- `Scene` 组织方式：`Boot -> Lobby(主玩法)`。
- `Entity` 思路：`LocalPlayer / RemotePlayer / Interactable`。
- `Manager/System` 思路：输入、网络、交互、动画分别拆分。
- `State Machine` 思路：使用轻量状态机，不必引入复杂框架。
- `Protocol Types` 思路：前后端共享 TS 类型，减少联调错误。

## 必须重写的逻辑
- AI 状态看板与 AI 任务状态流转逻辑必须全部去掉。
- 单主角展示逻辑要改成“房间内多玩家同步”。
- 后端状态文件监控模式要改成“实时玩家房间状态管理”。
- 主题、性能看板、PWA 非 MVP 必需模块暂不引入。

## 适配真人联机空间游戏的改造方案
- 场景目标：`Login(可由 DOM 承担) + LobbyScene`，首版仅一个公共房间。
- 玩家模型：`id/nickname/position/direction/state/coins`。
- 协议事件：
  - C->S: `join_room/move/chat/interact/ping`
  - S->C: `room_state/player_joined/player_left/player_moved/chat_message/interaction_state`
- 同步策略：本地移动节流上报 + 远端插值平滑 + 离开即销毁实体。
- 交互模型：桌子/咖啡机/沙发，E 键触发，状态切换并奖励 coins。
- 状态模型：`idle/walking/interacting/working/drinking/resting`。

## 当前项目已开始落地的骨架
- 前端：Phaser 场景 + 实体 + 系统 + UI Bridge。
- 后端：Socket.IO 房间管理与事件广播。
- shared：协议类型统一。
- 本次新增：`PlayerStateMachine` + `SceneKeys`，强化状态驱动和场景组织。
