# Timer

一款基于浏览器的呼吸练习计时器，提供粒子呼吸引导、练习记录、可选云同步、沉浸式动态场景和自然环境声音。

## 在线演示

https://timer.broyustudio.com/

## 功能

- 自定义吸气、呼气、停留时间和练习总时长
- 呼吸圆环与细腻粒子日冕视觉引导
- 支持减少动态效果、呼吸阶段提示音、暂停/继续、提前结束保存和屏幕唤醒锁
- 练习日历、月度统计、连续练习天数、每日目标、记录详情和 JSON 导出
- 生成高清练习快照并分享到 X
- 浏览器本地持久化，并兼容旧版 breath_settings / breath_history 数据
- 可选 Cloudflare R2 设置与练习记录同步
- 四种真实摄影场景：日落湖畔、海浪与晚霞、云海山顶、雨夜林中小屋
- 缓慢镜头移动及轻微的场景动态效果，可独立关闭背景
- 使用真实自然录音：海浪、轻柔雨声和清晨林间鸟鸣，不再用随机噪声模拟自然声音
- 场景和声音使用独立的一层菜单，点击即可切换；支持音量调节和偏好记忆。刷新后记住所选录音，但遵守浏览器限制，不自动播放
- 中英文界面，适配桌面和移动端

## 媒体来源与授权

背景摄影来自 Unsplash License：Raffaele Landi（日落湖畔）、Anja de Necker（海边晚霞）、ki Zhang（云海山顶）、Gadiel Lazcano（林中小屋）。

自然录音来自 Wikimedia Commons：[Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg)，作者 Luftrum，CC BY 3.0；[Sound of light rainfall.ogg](https://commons.wikimedia.org/wiki/File:Sound_of_light_rainfall.ogg)，作者 Mijesty，CC BY-SA 4.0；[Birdsong morning 01.ogg](https://commons.wikimedia.org/wiki/File:Birdsong_morning_01.ogg)，作者 Martin Thurnherr，CC BY-SA 4.0。

## 项目结构

项目使用原生 HTML、CSS 和 JavaScript。

- index.html — 页面结构
- engine.js — 呼吸计时模型
- corona.js — 粒子日冕渲染
- app.js — 页面交互、练习记录、提示音、日历和同步
- ambient.js — 环境场景选择与 Web Audio 声音生成
- share.js — 练习快照生成与分享
- styles.css — 视觉样式、环境场景和响应式布局

## 开发与测试

运行现有测试：

    node --test tests/*.test.cjs

## 语言

英文 README 是仓库默认首页。查看 [English](README.md)。