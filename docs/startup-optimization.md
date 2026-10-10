启动优化：道具并行预载、模型读取进度和按内容哈希缓存。

发布前运行 python tools/pack-models.py，生成 assets/packed 和 src/model-manifest.js，与源码一起发布。脚本逐个验证解压结果与原模型完全一致。未打包或浏览器不支持 DecompressionStream 时使用原模型。

51 个模型由 76,575,736 字节压缩至 50,562,500 字节，减少 34.0%；这是资源量测量，未测量平板启动耗时。

验证：node --test tests/*.test.mjs，28 项通过。
