# 删除会话记录（session-reaper）

在会话列表里直接删除一条会话的日志，不用再手动删 `%USERPROFILE%\.dsh\sessions` 下的目录。

## 用法

1. 会话列表里**右键**任意一行 → **「删除会话…」**
2. 确认框显示该会话标题，提醒"日志从磁盘永久删除、无法恢复"
3. 点「删除」→ 主机端删掉会话目录，页面收到 `api-session/removed`，**该行立即消失**

## 拒绝的情况

| 情况 | 行为 |
|---|---|
| 会话仍有进行中的工作（回合、子智能体、后台任务） | 拒绝，提示先停掉再删 |
| 会话只是"打开过"（进程内仍常驻） | 允许删除，删完该行立即消失 |
| 会话从未落盘（无日志文件） | 拒绝，提示没有可删的记录 |
| 路径不符合会话目录布局 | 拒绝，不删任何东西 |

当前版本只支持**单条删除**（点一个行删一个），没有批量清理、没有回收站。

## 删除后的残留

- 工作区记录 `storages/workspace.json` 里仍留着已删会话的 ID（含归档集合），界面按会话摘要过滤所以不显示，属无害残留；重启 DSH 后会彻底不再出现
- 投影缓存 `storages/session_projcache/sessions/<id>.json` 保留（几 KB，无引用），未自动清理
- 附件库 `attachments/v1/objects` 是按内容哈希共享的，不随会话删除释放
- 延迟删除：如果删除时有后台任务仍在写该会话，理论上会在删除后重新落盘；只在"已关闭"的会话上使用

## 实现

- 主机端：`index.js` 注册一条精确路由 `POST /__dsh/session-reaper/delete`，用 `sessionPersistence.stat()` 拿到日志路径，校验目录布局后 `rm -rf`，再 `ctx.emit('api-session/removed', id)`
- 页面端：`client.js` 往 `sidebar.workspaces.session.menu.item` 注册右键菜单项，往 `shell.overlay` 注册确认弹窗
- 注意：DSH 的会话持久化层没有删除 API（官方说明"logs accumulate under root until removed externally"），本插件是直接操作文件
