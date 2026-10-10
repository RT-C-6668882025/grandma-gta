# Android 个人测试版

原版游戏完整打包在 APK 内，通过本地 HTTPS 资源拦截提供给系统 Android WebView。无需联网下载模型，默认横屏和沉浸式全屏，复用网页键鼠及触控输入。

GitHub Actions 的 Android APK 工作流编译后可下载 grandma-gta-god-apk。也可准备 Android SDK 35 / Build Tools 35.0.0 / Java 17 后运行 bash android/build.sh。

当前是测试签名；每次全新云构建的签名不同，后续覆盖安装需要固定签名后再发布。WebView 需支持 ES Modules 和 import maps。未完成平板 APK 真机验收。
