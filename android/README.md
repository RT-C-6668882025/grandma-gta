# Android 固定签名稳定版

游戏资源完整打包，通过本地 HTTPS 资源拦截提供给系统 Android WebView；Android 8.0+，支持现代 WebView。

## 1.12 / 1.13 安装失败原因

旧工作流在每个新的 runner 上生成不同的 `test-key.jks`，因此版本之间无法覆盖安装。1.12 的构建仅归档 APK，没有归档私钥。不能从 APK 的公开证书恢复私钥。

稳定版从 1.13.1 开始使用独立包名 `com.rt.grandmagta.stable`，应用名「阿嬤俠盜 · 穩定版」，与旧版并存。**不用卸载旧版，旧存档留在旧应用中；新应用不会自动继承它。** 后续稳定版必须用同一密钥签名。

## 配置一次私有签名

仓库 Settings → Secrets and variables → Actions → New repository secret：

- Name：`ANDROID_SIGNING`
- Secret：私下交付的 `grandma-gta-signing-secret.txt` 全部内容。

此文件包含 PKCS12 密钥、密码和别名，不要提交代码或公开分享。只有公钥证书指纹 `android/signing-certificate.sha256` 存在仓库里。

配置完成后手动运行 Android APK 工作流。缺少配置、密码错误或证书与固定指纹不一致都会停止签名，不会再自动生成替代密钥。发布后的稳定版 APK 应保留相同证书指纹。

## 本地构建

准备 Java 17 JDK、Android SDK 35 / Build Tools 35.0.0、Python 3：

```sh
export ANDROID_SIGNING_FILE=/private/path/grandma-gta-signing-secret.txt
bash android/build.sh
```

工作流输出 APK；本地构建还生成 `.apk.sha256`，并检查 APK 签名、固定证书、清单解析与 ZIP 对齐。密钥仅在临时目录解码，签名结束后删除。不要用缓存或公开构建产物存储私钥。
