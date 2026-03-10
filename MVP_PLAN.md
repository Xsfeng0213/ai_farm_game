# AI Farm MVP 设计（第一版）

## 目标边界
- 房间制多人在线（默认 `lobby-1`）
- 玩家昵称登录、实时移动、公共聊天、表情、3 类互动物件
- 互动奖励 `coins`（每次互动 +1）
- 第一版不做：战斗、复杂背包、大地图、公会、3D

## 核心模块
- `client`：Phaser 渲染与输入、Socket.IO 客户端、HUD/聊天 UI
- `server`：Express + Socket.IO、房间内存状态、事件广播
- `shared/protocol`：多人同步协议类型（TS）

## 协议事件
客户端 -> 服务端
- `join_room`
- `move`
- `chat`
- `interact`
- `ping`

服务端 -> 客户端
- `room_state`
- `player_joined`
- `player_left`
- `player_moved`
- `chat_message`
- `interaction_state`

## 状态模型
- 角色状态：`idle | walking | interacting | working | drinking | resting`
- 朝向：`up | down | left | right`
- 房间状态：内存 Map（玩家快照 + 房间成员）

## 前端场景规划
- `BootScene`：启动和场景切换
- `LobbyScene`：大厅地图、移动、远程玩家同步、互动检测

## 迭代顺序
1. 阶段 1：项目初始化（当前进行）
2. 阶段 2：单人移动与相机
3. 阶段 3：多人位置同步和平滑
4. 阶段 4：聊天 + 表情
5. 阶段 5：互动物件 + coins
6. 阶段 6：收尾与文档
