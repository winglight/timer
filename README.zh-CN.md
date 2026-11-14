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
- 九种真实摄影场景：日落湖畔、海浪与晚霞、云海山顶、细雨林中小屋、森林晨雾、静谧溪谷、星空夜色、樱花微风、沙漠暮色
- 水面缓慢波动、雨滴降落、云雾飘动等轻柔环境动态，打开页面后及呼吸练习期间均可运行，可独立关闭背景
- 七种真实自然录音：海浪、轻柔雨声、清晨鸟鸣、森林环境声、溪流、篝火和微风，不用随机噪声模拟自然声音
- 场景和声音使用独立的一层菜单；支持音量调节和偏好记忆。打开页面后尝试自动恢复已启用的声音，浏览器拦截时在首次交互后接续播放
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
- ambient.js — 场景偏好、自然录音播放与自动恢复
- scene-motion.js — 独立且限制帧率的环境动态渲染
- share.js — 练习快照生成与分享
- styles.css — 视觉样式、环境场景和响应式布局

## 开发与测试

运行现有测试：

    node --test tests/*.test.cjs

## 声音恢复与动态背景

选择一种环境声音后，页面会记住录音和音量，下次打开时尝试自动播放。如果浏览器要求用户交互，声音菜单会显示“点击播放”，点击、触摸页面或按键即可重试。自动播放被拦截与录音加载失败会分别显示状态。主动暂停录音或选择“关闭声音”也会保存，刷新后保持安静。

摄影底图保持稳定，独立的 Canvas 只绘制水面、雨滴、云雾等局部环境动态，无需先开始呼吸练习。关闭背景、切换到其他标签页或开启系统“减少动态效果”后，动画循环停止。渲染器限制帧率和绘制分辨率，保持计时器与控件响应流畅。

## 语言

英文 README 是仓库默认首页。查看 [English](README.md)。
