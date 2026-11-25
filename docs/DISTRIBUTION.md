# 分发说明

这份说明面向“把题小星交给别人安装”的场景，不涉及应用商店后台操作。项目当前没有
Google Play、App Store 或国内应用商店的开发者账号，因此本仓库只负责产出可安装、
可验签的 Android 产物；上架资料由持有账号的一方补齐。

## 一、当前产物

| 文件 | 用途 |
| --- | --- |
| `artifacts/tixing-2.2.0-release.apk` | 直接安装到 Android 手机；已用 release keystore 签名 |
| `artifacts/tixing-2.2.0-release.aab` | 交给 Google Play 或支持 AAB 的商店；不能直接侧载 |
| `artifacts/SHA256SUMS-2.2.0.txt` | 两个产物的 SHA-256，用于分发后校验 |

`versionName=2.2.0`，`versionCode=2002000`，`minSdk=24`，`targetSdk=36`。
2.1.0 与 2.0.4 的 APK/AAB 与校验文件仍保留在 `artifacts/`，用于回滚与旧版本对照，不覆盖、不删除。

当前产物校验和：

```text
99cf43895349ef5ed4241b1092c311eaade0c3a9ab4c1298e329c4178592d0ce  tixing-2.2.0-release.apk（3,807,207 bytes）
d0d23c8aab8f59255a5210243f77e2bc4192f0578e405da9c37b45d734cebbf6  tixing-2.2.0-release.aab（3,662,690 bytes）
```

AAB 只用于商店上传，不能直接侧载；手机安装用 APK。

## 二、Android 安装

1. 把 APK 传到手机（数据线、网盘或聊天工具均可）。
2. 在系统设置里允许当前文件管理器/浏览器“安装未知来源应用”。
3. 点击 APK 安装。若手机上已有 **debug 版**（`com.tixing.offline.ai.debug` 是另一
   包名，不会冲突；同包名的旧 debug 包会冲突），先卸载旧包再装 release。
4. release 与 debug 使用不同证书，**不能互相覆盖升级**。从 release 换 release
   才能保留数据；换签名必须卸载，卸载会清掉应用数据，先导出备份。

## 三、商店与 AAB

- Google Play 上传 `tixing-2.2.0-release.aab`，包名 `com.tixing.offline.ai`。
- 国内商店有各自的备案、资质与主体要求；这些不是构建脚本能替代的。
- 首次上架后，后续版本必须使用同一份 keystore 签名，否则商店会拒绝升级。

## 四、签名材料

release 签名材料位于本机：

- keystore：`keystore/tixing-release.jks`
- 配置：`android/keystore.properties`

两者都被 `.gitignore` 排除，不会进入仓库。请离线备份 keystore 与口令；丢失后
无法给已安装用户推送同签名升级包，只能换包名重新上架。

证书 SHA-256：

```text
98e194023037e9f38aafca8ceab9ebb9f0417b129ad418a76c768489f298999e
```

## 五、分发后校验

接收方可先核对哈希，再安装：

```bash
sha256sum -c SHA256SUMS-2.2.0.txt
```

构建方可复验签名：

```bash
node scripts/verify-signature.mjs artifacts/tixing-2.2.0-release.apk \
  "$ANDROID_HOME" "$JAVA_HOME"
```

APK 走 `apksigner verify --print-certs`，AAB 走 `jarsigner -verify`。

## 六、尚未覆盖

- iOS：需要 macOS + Xcode，本仓库没有 iOS 工程与构建环境。
- Windows/macOS 桌面安装包：Linux 上只能交叉编译部分目标；Windows NSIS/MSI 需在
  Windows 上执行 `pnpm desktop:build`。
- Android 真机运行时：本机没有模拟器/真机，安装后的首启、导入、答题链路由主
  E2E 的 Android 资源加载场景覆盖，不等同于真实设备兼容性测试。
