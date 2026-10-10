<div align="center">

# 阿嬤俠盜 · Android 魔改版

**72 岁阿嬤的开放世界，现在能装进安卓手机和平板。**

离线 APK · 触屏与外接键鼠 · 三种视角 · 无敌与飞行

[下载最新版 APK](https://github.com/RT-C-6668882025/grandma-gta/releases/latest) · [所有版本](https://github.com/RT-C-6668882025/grandma-gta/releases) · [原项目](https://github.com/andyhuo520/grandma-gta)

![Android](https://img.shields.io/badge/Android-8.0%2B-3DDC84?logo=android&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

这是基于 [andyhuo520/grandma-gta](https://github.com/andyhuo520/grandma-gta) 的魔改分支，由 [RT-C-6668882025](https://github.com/RT-C-6668882025) 维护。保留原作的小镇、任务、角色、交通、商店和配音，主要改造安卓运行、操作体验与自由游玩能力。

## 本分支改了什么

| 功能 | 当前实现 |
| --- | --- |
| Android App | 游戏与模型打包进 APK；离线启动，横屏与沉浸式全屏 |
| 平板操作 | 左侧摇杆移动，滑动画面转视角，右侧动作按钮；支持蓝牙键盘、鼠标与触屏同时使用 |
| 第三人称 | 默认近距离跟随；上下车分别使用合适距离；手动转向后保持视角，按 Z 回正 |
| 第一人称 | 从人物视线观察，隐藏自身模型，避免遮挡 |
| 上帝视角 | 从高处俯看小镇，可旋转和调整距离 |
| 自由转向 | 鼠标两路事件兼容与去重；未锁定时停在画面边缘持续转向，移回中央停止 |
| 无敌 | 玩家无限生命与体力，保护当前驾驶车辆 |
| 无限钱 | 默认保持充足余额，购买物品不扣钱 |
| 超速 | 步行与驾驶可选 2 / 4 / 8 倍速度，仅作用于玩家 |
| 飞行 | 可开关，自由升降；触屏也有对应按钮 |
| 画质与加载 | 低 / 中 / 高画质；网页模型 gzip 打包与缓存，APK 直接读取本地模型 |

无敌、无限钱和 4 倍速度默认开启；飞行默认关闭。点「能力」可分别切换，视角和能力偏好会保存在当前设备。

## 下载与安装

打开 [Releases](https://github.com/RT-C-6668882025/grandma-gta/releases/latest)，下载其中的 **grandma-gta-god.apk**。

- Android 8.0 及以上；系统 Android WebView 需支持 WebGL、ES Modules 与 import maps。
- 游戏资源包含在安装包内，游玩无需联网下载模型。
- 当前 APK 使用个人测试签名，不同云构建的签名可能不同。无法覆盖安装时，需先卸载旧版；卸载会清除本地存档与设置。
- 已完成自动测试、APK 构建与签名校验；不同设备的帧率、键鼠捕获及完整任务流程仍需真机验证。

## 怎么玩

### 触屏

横屏打开：左下摇杆移动，拖动画面转视角，右下按钮执行动作。顶部可打开背包、手机、地图与暂停；「视角」按钮切换镜头，「能力」按钮切换魔改能力。

使用外接键鼠时，可点「触控：关」隐藏触屏操作区。

### 键鼠

| 操作 | 按键 |
| --- | --- |
| 移动 / 奔跑 | WASD / Shift |
| 转动视角 | 移动鼠标；自由鼠标模式下，停在画面边缘可持续转向 |
| 鼠标模式 | 画面上的「滑鼠」按钮：移动与边缘转向 / 右键拖曳 / 锁定视角 |
| 切换镜头 / 回正 | C / Z |
| 镜头距离 | 滚轮；第三人称调距离，上帝视角调观察距离 |
| 能力菜单 / 飞行开关 | O / V |
| 飞行上升 / 下降 | PageUp / PageDown |
| 攻击 / 投掷 | 左键或 J / G |
| 互动 / 上下车与抢车 | E / F |
| 驾驶 | W / S 油门与倒车，A / D 转向，空格刹车与喇叭 |
| 电台 / 痞步 | R / Q |
| 补药 / 抽烟 / 槟榔 | H / X / B |
| 背包 / 手机 / 地图 | Tab / T / M |
| 暂停与返回 | Esc |

浏览器能否锁定鼠标、进入真全屏，由浏览器与嵌入页面权限决定。锁定不可用时，移动与边缘转向仍可使用。

## 自己魔改

网页部分不需要安装 npm 依赖，使用静态服务器即可运行：

```bash
git clone https://github.com/RT-C-6668882025/grandma-gta.git
cd grandma-gta
python3 tools/serve.py
```

在浏览器打开 `http://localhost:8965`，修改代码后刷新。

| 想改什么 | 文件 |
| --- | --- |
| 默认能力、无限钱余额、飞行范围 | `src/mods.js` |
| 三种镜头的距离与俯仰范围 | `src/camera-modes.js`、`src/camera.js` |
| 鼠标输入、边缘转向速度 | `src/input.js` |
| 触屏按钮 | `src/touch.js`、`src/ui.css` |
| 玩家、NPC 与战斗 | `src/entities.js` |
| 车辆与交通 | `src/vehicles.js` |
| 任务与对话 | `src/story.js`、`src/chapter2.js` |
| Android 外壳与打包 | `android/`、`.github/workflows/android-apk.yml` |

运行测试：

```bash
node --test tests/*.test.mjs
```

网页模型打包：

```bash
python3 tools/pack-models.py
```

Android 构建需要 Java 17、Android SDK Platform 35 和 Build Tools 35.0.0：

```bash
bash android/build.sh
```

输出：`android/build/grandma-gta-god.apk`。GitHub Actions 也会为游戏与安卓代码变更构建 APK；更多说明见 [Android 构建说明](android/README.md)。

| URL 参数 | 用途 |
| --- | --- |
| `?nostory` | 不自动开始主线，自由游玩 |
| `?story=N` | 从指定关卡开始 |
| `?autostart` | 跳过标题画面 |

## 原作与致谢

原作的台湾乡村地图、阿嬤角色、主线与支线、广场舞、抢车、NPC 执法等内容来自 [andyhuo520/grandma-gta](https://github.com/andyhuo520/grandma-gta)。原作使用 Three.js 渲染、Tripo 生成模型、MiMo TTS 生成配音；原作制作流程见其 [README](https://github.com/andyhuo520/grandma-gta#readme)。

代码沿用 [MIT 许可证](LICENSE)。模型与配音沿用原项目的素材和授权说明。仓库不附带受版权保护的广场舞原曲，缺少原曲时使用游戏内合成音乐。
