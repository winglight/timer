# Timer

这是一个带粒子呼吸引导、练习记录和云同步的呼吸练习计时器。

## Demo

在线演示地址：[https://timer.broyustudio.com/](https://timer.broyustudio.com/)

## 功能

- 自定义吸气、呼气、呼气后停留和练习总时长
- 清晰圆形与粒子日冕视觉引导，支持减少动态效果
- 呼吸阶段声音提示、暂停/继续、提前结束保存和屏幕唤醒锁
- 练习日历、月度统计、连续天数、每日目标、记录查看和 JSON 导出
- 浏览器本地持久化，并兼容旧版 `breath_settings` / `breath_history` 数据
- 可选 R2 设置与练习记录同步，支持旧云端实体迁移合并
- 中英文界面（默认跟随浏览器，可在页头切换并记住选择）和桌面/移动端响应式布局

页面代码按职责拆分为 `engine.js`（计时模型）、`corona.js`（粒子渲染）、`app.js`（交互、记录、声音和同步）以及 `styles.css`（视觉与响应式样式）。

## 验证

```sh
node --test tests/timing.test.cjs
```
